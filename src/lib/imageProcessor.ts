import sharp from "sharp";
import path from "path";
import fs from "fs";

// ─── Constantes ──────────────────────────────────────────────────────────────

const MAX_PIXELS = 2_000_000; // 2 MP

// Proporciones del marco Polaroid (relativas al ancho de la foto)
const PAD_SIDE   = 0.07;   // 7 % a cada lado
const PAD_TOP    = 0.07;   // 7 % arriba
const PAD_BOTTOM_TEXT    = 0.30; // 30 % abajo (con mensaje)
const PAD_BOTTOM_NO_TEXT = 0.22; // 22 % abajo (sin mensaje)

// ─── Utilidades ──────────────────────────────────────────────────────────────

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Parte el texto en líneas que quepan en maxChars caracteres (máx. 3 líneas). */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** Lee la fuente Dancing Script y la retorna como base64 (se cachea en memoria). */
let _fontB64: string | null = null;
function getFontB64(): string {
  if (!_fontB64) {
    const fontPath = path.join(process.cwd(), "public", "fonts", "DancingScript-Regular.ttf");
    _fontB64 = fs.readFileSync(fontPath).toString("base64");
  }
  return _fontB64;
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function processPolaroid(
  input: Buffer,
  message?: string
): Promise<Buffer> {

  // 1 ── Leer dimensiones originales
  const meta  = await sharp(input).metadata();
  const origW = meta.width  ?? 1000;
  const origH = meta.height ?? 1000;

  // 2 ── Calcular dimensiones objetivo (máx 2 MP)
  const currentMP = origW * origH;
  let targetW = origW;
  let targetH = origH;
  if (currentMP > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / currentMP);
    targetW = Math.round(origW * scale);
    targetH = Math.round(origH * scale);
  }

  // 3 ── Resize + efecto Polaroid (color grade)
  //   • modulate: ligeramente más brillante y desaturado (look "faded")
  //   • recomb:   matriz cálida (boost rojo, reduce azul → tono película vintage)
  //   • linear:   levanta las sombras → aspecto desteñido característico Polaroid
  const graded = await sharp(input)
    .resize(targetW, targetH, { fit: "fill" })
    .modulate({ brightness: 1.06, saturation: 0.82 })
    .recomb([
      [1.07, 0.03, 0.01],
      [0.01, 0.99, 0.01],
      [0.00, 0.02, 0.93],
    ])
    .linear(0.94, 12)           // output = 0.94·input + 12
    .toBuffer();

  // 4 ── Viñeta (SVG radial gradient sobre la foto)
  const vignetteSvg = `<svg width="${targetW}" height="${targetH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="68%">
        <stop offset="0%"   stop-color="transparent"/>
        <stop offset="100%" stop-color="rgba(18,8,4,0.38)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;

  const withVignette = await sharp(graded)
    .composite([{ input: Buffer.from(vignetteSvg), blend: "over" }])
    .toBuffer();

  // 5 ── Marco Polaroid (extend con fondo blanco cálido)
  const padSide   = Math.round(targetW * PAD_SIDE);
  const padTop    = Math.round(targetW * PAD_TOP);
  const padBottom = Math.round(targetW * (message?.trim() ? PAD_BOTTOM_TEXT : PAD_BOTTOM_NO_TEXT));

  const framed = await sharp(withVignette)
    .extend({
      top:    padTop,
      left:   padSide,
      right:  padSide,
      bottom: padBottom,
      background: { r: 255, g: 253, b: 248, alpha: 1 },
    })
    .toBuffer();

  const framedW = targetW + padSide * 2;
  const framedH = targetH + padTop + padBottom;

  // 6 ── Texto a mano (sólo si hay mensaje)
  if (message?.trim()) {
    const fontB64 = getFontB64();

    // Calcular font-size y salto de línea proporcional al área inferior
    const fontSize   = Math.round(padBottom * 0.21);
    const lineHeight = Math.round(fontSize * 1.45);

    // Estimar caracteres por línea (Dancing Script ≈ 0.52 × fontSize por char)
    const charsPerLine = Math.max(15, Math.floor(framedW / (fontSize * 0.52)));
    const lines        = wrapText(message.trim(), charsPerLine);

    // Centrar bloque de texto verticalmente en el área inferior
    const blockH  = lines.length * lineHeight;
    const baseY   = targetH + padTop + (padBottom - blockH) / 2 + fontSize * 0.75;

    const textElements = lines
      .map((line, i) =>
        `<text
          x="${framedW / 2}"
          y="${Math.round(baseY + i * lineHeight)}"
          font-family="DancingScript, cursive"
          font-size="${fontSize}"
          fill="#4a3f35"
          text-anchor="middle"
        >${escapeXml(line)}</text>`
      )
      .join("\n");

    const svgOverlay = `<svg
      width="${framedW}"
      height="${framedH}"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <style>
          @font-face {
            font-family: 'DancingScript';
            src: url('data:font/truetype;base64,${fontB64}');
          }
        </style>
      </defs>
      ${textElements}
    </svg>`;

    return sharp(framed)
      .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
      .webp({ quality: 82 })
      .toBuffer();
  }

  return sharp(framed).webp({ quality: 82 }).toBuffer();
}
