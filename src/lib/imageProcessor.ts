import sharp from "sharp";

// ─── Constantes ───────────────────────────────────────────────────────────────
const MAX_SIDE = 1414; // √2_000_000 ≈ 1414 → máx 2 MP en imágenes cuadradas

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Elimina emojis — librsvg no los puede renderizar */
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parte el texto en líneas de máx maxChars caracteres (máx 3 líneas). */
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

function formatDate(d: Date): string {
  const date = d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}  ·  ${time}`;
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function processPolaroid(
  input: Buffer,
  message?: string
): Promise<Buffer> {
  const cleanMsg = message ? stripEmoji(message) : "";

  // ── 1. Rotar por EXIF + resize manteniendo proporción ─────────────────────
  const { data: resizedBuf, info } = await sharp(input)
    .rotate()   // auto-rota según metadatos EXIF (portrait/landscape correcto)
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const W = info.width;   // ancho real tras resize
  const H = info.height;  // alto  real tras resize

  // ── 2. Color grade Polaroid ────────────────────────────────────────────────
  //   recomb: matriz de color cálida (boost rojo, reduce azul)
  //   linear: levanta las sombras → look "faded" de película
  const graded = await sharp(resizedBuf)
    .modulate({ brightness: 1.06, saturation: 0.82 })
    .recomb([
      [1.07, 0.03, 0.01],
      [0.01, 0.99, 0.01],
      [0.00, 0.02, 0.93],
    ])
    .linear(0.94, 12)
    .toBuffer();

  // ── 3. Viñeta ─────────────────────────────────────────────────────────────
  const vignetteSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="68%">
        <stop offset="0%"   stop-color="transparent"/>
        <stop offset="100%" stop-color="rgba(18,8,4,0.36)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;

  const withVignette = await sharp(graded)
    .composite([{ input: Buffer.from(vignetteSvg), blend: "over" }])
    .toBuffer();

  // ── 4. Marco Polaroid ─────────────────────────────────────────────────────
  //  El padding se calcula sobre el ancho real de la foto.
  //  El borde inferior es siempre más ancho (área de escritura).
  const padSide   = Math.max(55, Math.round(W * 0.07));
  const padTop    = Math.max(55, Math.round(W * 0.07));
  const padBottom = cleanMsg
    ? Math.max(150, Math.round(W * 0.32))  // espacio para texto + fecha
    : Math.max(100, Math.round(W * 0.20)); // solo fecha

  const framed = await sharp(withVignette)
    .extend({
      top:    padTop,
      left:   padSide,
      right:  padSide,
      bottom: padBottom,
      background: { r: 255, g: 253, b: 248, alpha: 1 },
    })
    .toBuffer();

  const FW = W + padSide * 2;          // ancho total del Polaroid
  const FH = H + padTop + padBottom;   // alto  total del Polaroid
  const areaTop = H + padTop;          // Y donde empieza el área inferior blanca

  // ── 5. SVG overlay: texto + fecha ─────────────────────────────────────────
  //  La fuente "Dancing Script" debe estar instalada en el sistema del contenedor
  //  (ver Dockerfile). librsvg la resuelve por nombre via fontconfig.
  const innerPad = Math.round(padBottom * 0.08);
  const dateStr  = escapeXml(formatDate(new Date()));

  let textNodes = "";

  if (cleanMsg) {
    const msgFontSize  = Math.max(22, Math.round(padBottom * 0.19));
    const lineHeight   = Math.round(msgFontSize * 1.50);
    const charsPerLine = Math.max(10, Math.floor(FW / (msgFontSize * 0.56)));
    const lines        = wrapText(cleanMsg, charsPerLine);
    const msgBlockH    = lines.length * lineHeight;

    const dateFontSize = Math.max(14, Math.round(msgFontSize * 0.50));

    // Espacio disponible para mensaje (dejando hueco fijo para la fecha abajo)
    const dateZone  = dateFontSize + innerPad * 2;
    const msgAreaH  = padBottom - dateZone;
    const msgStartY = areaTop + (msgAreaH - msgBlockH) / 2 + msgFontSize * 0.85;

    textNodes += lines
      .map((line, i) =>
        `<text
          x="${FW / 2}"
          y="${Math.round(msgStartY + i * lineHeight)}"
          font-family="Dancing Script, serif"
          font-size="${msgFontSize}"
          fill="#3d3028"
          text-anchor="middle"
        >${escapeXml(line)}</text>`
      )
      .join("\n");

    // Fecha centrada en la zona baja del marco
    const dateY = FH - innerPad - dateFontSize * 0.2;
    textNodes += `<text
      x="${FW / 2}"
      y="${dateY}"
      font-family="Dancing Script, serif"
      font-size="${dateFontSize}"
      fill="#9a8270"
      text-anchor="middle"
    >${dateStr}</text>`;

  } else {
    // Sin mensaje: solo la fecha centrada en el área inferior
    const dateFontSize = Math.max(16, Math.round(padBottom * 0.20));
    const dateY = areaTop + padBottom / 2 + dateFontSize * 0.35;

    textNodes = `<text
      x="${FW / 2}"
      y="${dateY}"
      font-family="Dancing Script, serif"
      font-size="${dateFontSize}"
      fill="#9a8270"
      text-anchor="middle"
    >${dateStr}</text>`;
  }

  const svgOverlay = `<svg
    width="${FW}"
    height="${FH}"
    xmlns="http://www.w3.org/2000/svg"
  >${textNodes}</svg>`;

  return sharp(framed)
    .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
    .webp({ quality: 82 })
    .toBuffer();
}
