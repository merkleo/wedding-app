import sharp from "sharp";

// ─── Constantes ───────────────────────────────────────────────────────────────
const MAX_SIDE  = 1414; // √2_000_000 ≈ 1414 → máx 2 MP en imágenes cuadradas
const GOLD      = "#C9A84C";

// ─── Helpers de texto ─────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Elimina emojis — librsvg no puede renderizarlos */
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parte el texto en líneas de máx maxChars chars (máx 3 líneas) */
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
  return (
    d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) +
    "  ·  " +
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── Elementos SVG decorativos ────────────────────────────────────────────────

function cornerOrnament(
  cx: number, cy: number,
  hDir: 1 | -1, vDir: 1 | -1,
  dSize: number, armLen: number
): string {
  const pts = [
    `${cx},${cy - dSize}`,
    `${cx + Math.round(dSize * 0.65 * hDir)},${cy}`,
    `${cx},${cy + dSize}`,
    `${cx - Math.round(dSize * 0.65 * hDir)},${cy}`,
  ].join(" ");

  const hx2 = cx + (dSize + armLen) * hDir;
  const vy2 = cy + (dSize + armLen) * vDir;

  return `
    <polygon points="${pts}" fill="${GOLD}" opacity="0.82"/>
    <line x1="${cx + Math.round(dSize * 0.8 * hDir)}" y1="${cy}"
          x2="${hx2}" y2="${cy}"
          stroke="${GOLD}" stroke-width="1.3" stroke-linecap="round" opacity="0.60"/>
    <line x1="${cx}" y1="${cy + Math.round(dSize * 0.8 * vDir)}"
          x2="${cx}" y2="${vy2}"
          stroke="${GOLD}" stroke-width="1.3" stroke-linecap="round" opacity="0.60"/>
    <circle cx="${hx2 + 3 * hDir}" cy="${cy}"  r="2" fill="${GOLD}" opacity="0.50"/>
    <circle cx="${cx}"              cy="${vy2 + 3 * vDir}" r="2" fill="${GOLD}" opacity="0.50"/>`;
}

function separatorLine(y: number, x1: number, x2: number, dSize: number): string {
  const cx = Math.round((x1 + x2) / 2);
  const pts = [
    `${cx},${y - dSize}`,
    `${cx + Math.round(dSize * 0.65)},${y}`,
    `${cx},${y + dSize}`,
    `${cx - Math.round(dSize * 0.65)},${y}`,
  ].join(" ");

  return `
    <line x1="${x1}" y1="${y}" x2="${cx - Math.round(dSize * 1.4)}" y2="${y}"
          stroke="${GOLD}" stroke-width="0.9" opacity="0.52"/>
    <polygon points="${pts}" fill="${GOLD}" opacity="0.68"/>
    <line x1="${cx + Math.round(dSize * 1.4)}" y1="${y}" x2="${x2}" y2="${y}"
          stroke="${GOLD}" stroke-width="0.9" opacity="0.52"/>`;
}

// ─── Pipeline principal ───────────────────────────────────────────────────────
//
// Optimización: 5 pipelines Sharp → 3 pipelines Sharp
//
//  ANTES          | DESPUÉS
//  ─────────────────────────────────────────────────────
//  1. rotate+resize → buf           │ 1. rotate+resize → buf  (igual)
//  2. modulate+recomb+linear → buf  │ 2. modulate+recomb+linear
//  3. composite(vignette) → buf     │    + composite(vignette) → buf  ← fusión 2+3
//  4. extend → buf                  │ 3. extend
//  5. composite(overlay) → webp     │    + composite(overlay) → webp  ← fusión 4+5
//
// Cada pipeline Sharp que eliminamos ahorra:
//   - 1 codificación/decodificación de pixels en RAM
//   - inicialización del contexto libvips
//
// Posible porque los SVGs dependen sólo de W/H (conocidos tras el paso 1),
// por lo que se pueden precalcular en JS puro antes de lanzar los pipelines.

export async function processPolaroid(
  input: Buffer,
  message?: string
): Promise<Buffer> {
  const cleanMsg    = message ? stripEmoji(message) : "";
  const coupleNames = escapeXml(process.env.COUPLE_NAMES ?? "");
  const now         = new Date();

  // ── 1. Rotar por EXIF + resize manteniendo proporción (≤ 2 MP) ────────────
  // Único toBuffer() obligatorio: necesitamos W y H reales para todo lo demás.
  const { data: resized, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;

  // ── 2. Cálculos de layout (100 % síncronos, coste ≈ 0 ms) ─────────────────
  const padSide   = Math.max(55, Math.round(W * 0.07));
  const padTop    = Math.max(55, Math.round(W * 0.07));
  const FW        = W + padSide * 2;

  const ornPad    = Math.max(16, Math.round(padSide * 0.28));
  const ornDSize  = Math.max(5,  Math.round(padSide * 0.12));
  const ornArmLen = Math.max(18, Math.round(padSide * 0.55));
  const innerPad  = Math.max(10, Math.round(W * 0.014));

  const nameFontSize = Math.min(42, Math.max(15, Math.round(W * 0.024)));
  const msgFontSize  = Math.min(72, Math.max(22, Math.round(W * 0.050)));
  const dateFontSize = Math.min(34, Math.max(13, Math.round(msgFontSize * 0.46)));
  const lineH        = Math.round(msgFontSize * 1.38);

  const maxChars  = Math.max(10, Math.floor(FW / (msgFontSize * 0.56)));
  const lines     = cleanMsg ? wrapText(cleanMsg, maxChars) : [];
  const msgBlockH = lines.length * lineH;

  const sepZone   = innerPad + ornDSize + innerPad * 0.7;
  const nameZone  = nameFontSize + innerPad * 0.8;
  const msgZone   = msgBlockH > 0 ? msgBlockH + innerPad * 0.6 : 0;
  const dateZone  = dateFontSize + innerPad;
  const ornZone   = ornPad + ornDSize + Math.round(ornArmLen * 0.6);
  const padBottom = Math.round(sepZone + nameZone + msgZone + dateZone + ornZone);

  const FH        = H + padTop + padBottom;
  const areaTop   = H + padTop;

  const lineX1    = ornPad + ornDSize + ornArmLen + ornPad * 0.5;
  const lineX2    = FW - lineX1;
  const sepY      = areaTop + innerPad + ornDSize;
  const nameY     = Math.round(sepY + innerPad * 0.7 + nameFontSize);
  const msgStartY = Math.round(nameY + innerPad * 0.8 + msgFontSize * 0.85);
  const dateY     = cleanMsg
    ? Math.round(msgStartY + msgBlockH + innerPad * 0.6 + dateFontSize)
    : Math.round(nameY + innerPad * 0.6 + dateFontSize);

  // ── 3. Generar ambos SVGs antes de cualquier pipeline Sharp ───────────────
  // La viñeta solo usa W × H (conocidos). El overlay usa FW × FH (calculados).
  // Al generarlos aquí, los dos pipelines siguientes no necesitan esperar JS.

  const vigSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="68%">
        <stop offset="0%"   stop-color="transparent"/>
        <stop offset="100%" stop-color="rgba(18,8,4,0.36)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;

  const corners = [
    cornerOrnament(ornPad + ornDSize,        ornPad + ornDSize,        1,  1,  ornDSize, ornArmLen),
    cornerOrnament(FW - ornPad - ornDSize,   ornPad + ornDSize,       -1,  1,  ornDSize, ornArmLen),
    cornerOrnament(ornPad + ornDSize,        FH - ornPad - ornDSize,   1, -1,  ornDSize, ornArmLen),
    cornerOrnament(FW - ornPad - ornDSize,   FH - ornPad - ornDSize,  -1, -1,  ornDSize, ornArmLen),
  ].join("\n");

  const separator = separatorLine(sepY, lineX1, lineX2, ornDSize);

  const nameNode = coupleNames
    ? `<text
        x="${FW / 2}" y="${nameY}"
        font-family="Dancing Script, serif"
        font-size="${nameFontSize}"
        fill="${GOLD}"
        text-anchor="middle"
        letter-spacing="0.5"
      >${coupleNames}</text>`
    : "";

  const msgNodes = lines
    .map((line, i) =>
      `<text
        x="${FW / 2}"
        y="${Math.round(msgStartY + i * lineH)}"
        font-family="Dancing Script, serif"
        font-size="${msgFontSize}"
        fill="#3d3028"
        text-anchor="middle"
      >${escapeXml(line)}</text>`
    )
    .join("\n");

  const dateNode = `<text
    x="${FW / 2}" y="${dateY}"
    font-family="Dancing Script, serif"
    font-size="${dateFontSize}"
    fill="#9a8270"
    text-anchor="middle"
  >${escapeXml(formatDate(now))}</text>`;

  const svgOverlay = `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">
    ${corners}
    ${separator}
    ${nameNode}
    ${msgNodes}
    ${dateNode}
  </svg>`;

  // ── 4. Pipeline Sharp: color grade + viñeta (antes eran 2 llamadas) ────────
  const withVig = await sharp(resized)
    .modulate({ brightness: 1.06, saturation: 0.82 })
    .recomb([
      [1.07, 0.03, 0.01],
      [0.01, 0.99, 0.01],
      [0.00, 0.02, 0.93],
    ])
    .linear(0.94, 12)
    .composite([{ input: Buffer.from(vigSvg), blend: "over" }])
    .toBuffer();

  // ── 5. Pipeline Sharp: marco Polaroid + overlay SVG + encode WebP ──────────
  // Sharp aplica .extend() antes que .composite() en su pipeline interno,
  // así que el overlay (FW×FH) se composita sobre la imagen ya extendida. ✓
  return sharp(withVig)
    .extend({
      top:    padTop,
      left:   padSide,
      right:  padSide,
      bottom: padBottom,
      background: { r: 255, g: 253, b: 248, alpha: 1 },
    })
    .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
    .webp({ quality: 87 })   // 82 → 87: mejor calidad, +15% tamaño archivo
    .toBuffer();
}

// ─── Thumbnail (sin marco Polaroid, cuadrado 400×400) ─────────────────────────

export async function generateThumbnail(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()                                              // respeta EXIF
    .resize(400, 400, { fit: "cover", position: "centre" })
    .webp({ quality: 70 })
    .toBuffer();
}
