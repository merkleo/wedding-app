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

/**
 * Ornamento de esquina: diamante + dos brazos en L
 * hDir = 1 (hacia la derecha) | -1 (hacia la izquierda)
 * vDir = 1 (hacia abajo)      | -1 (hacia arriba)
 */
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

/** Línea separadora con diamante central */
function separatorLine(
  y: number, x1: number, x2: number, dSize: number
): string {
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

export async function processPolaroid(
  input: Buffer,
  message?: string
): Promise<Buffer> {
  const cleanMsg    = message ? stripEmoji(message) : "";
  const coupleNames = escapeXml(process.env.COUPLE_NAMES ?? "");
  const now         = new Date();

  // ── 1. Rotar por EXIF + resize manteniendo proporción (≤ 2 MP) ────────────
  const { data: resized, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;

  // ── 2. Color grade Polaroid ────────────────────────────────────────────────
  const graded = await sharp(resized)
    .modulate({ brightness: 1.06, saturation: 0.82 })
    .recomb([
      [1.07, 0.03, 0.01],
      [0.01, 0.99, 0.01],
      [0.00, 0.02, 0.93],
    ])
    .linear(0.94, 12)
    .toBuffer();

  // ── 3. Viñeta ─────────────────────────────────────────────────────────────
  const vigSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="50%" r="68%">
        <stop offset="0%"   stop-color="transparent"/>
        <stop offset="100%" stop-color="rgba(18,8,4,0.36)"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;

  const withVig = await sharp(graded)
    .composite([{ input: Buffer.from(vigSvg), blend: "over" }])
    .toBuffer();

  // ── 4. Marco Polaroid ─────────────────────────────────────────────────────
  // Los tamaños se basan en W (ancho de la foto) para escalar proporcionalmente
  // sin importar si es portrait o landscape.
  const padSide   = Math.max(55, Math.round(W * 0.07));
  const padTop    = Math.max(55, Math.round(W * 0.07));
  const padBottom = cleanMsg
    ? Math.max(220, Math.round(W * 0.44))  // espacio para sep + nombres + msg + fecha
    : Math.max(160, Math.round(W * 0.28)); // espacio para sep + nombres + fecha

  const framed = await sharp(withVig)
    .extend({
      top:    padTop,
      left:   padSide,
      right:  padSide,
      bottom: padBottom,
      background: { r: 255, g: 253, b: 248, alpha: 1 },
    })
    .toBuffer();

  const FW      = W + padSide * 2;
  const FH      = H + padTop + padBottom;
  const areaTop = H + padTop; // Y donde empieza el área blanca inferior

  // ── 5. Medidas de los elementos decorativos ───────────────────────────────
  const ornPad    = Math.max(18, Math.round(padSide * 0.28));
  const ornDSize  = Math.max(5,  Math.round(padSide * 0.12));
  const ornArmLen = Math.max(20, Math.round(padSide * 0.58));
  const innerPad  = Math.max(18, Math.round(W * 0.022));

  // Fuentes (basadas en W para consistencia portrait/landscape)
  const nameFontSize = Math.min(46, Math.max(17, Math.round(W * 0.026)));
  const msgFontSize  = Math.min(78, Math.max(24, Math.round(W * 0.052)));
  const dateFontSize = Math.min(38, Math.max(14, Math.round(msgFontSize * 0.48)));

  // Línea separadora: respeta espacio de ornamentos en los extremos
  const lineX1 = ornPad + ornDSize + ornArmLen + ornPad * 0.5;
  const lineX2 = FW - lineX1;

  // ── 6. Posiciones Y en el área inferior ──────────────────────────────────
  const sepY   = areaTop + innerPad + ornDSize;
  const nameY  = sepY + innerPad + nameFontSize;

  // Posición Y del mensaje: centrado entre nameY y la zona de fecha
  const dateY     = FH - ornPad - dateFontSize - innerPad;
  const lineH     = Math.round(msgFontSize * 1.50);
  const lines     = cleanMsg
    ? wrapText(cleanMsg, Math.max(10, Math.floor(FW / (msgFontSize * 0.56))))
    : [];
  const msgBlockH = lines.length * lineH;
  const msgArea   = dateY - (nameY + innerPad) - dateFontSize * 0.5;
  const msgStartY = nameY + innerPad + (msgArea - msgBlockH) / 2 + msgFontSize * 0.85;

  // ── 7. SVG overlay ────────────────────────────────────────────────────────

  // Ornamentos en las 4 esquinas del marco completo
  const corners = [
    cornerOrnament(ornPad + ornDSize,        ornPad + ornDSize,        1,  1,  ornDSize, ornArmLen),
    cornerOrnament(FW - ornPad - ornDSize,   ornPad + ornDSize,       -1,  1,  ornDSize, ornArmLen),
    cornerOrnament(ornPad + ornDSize,        FH - ornPad - ornDSize,   1, -1,  ornDSize, ornArmLen),
    cornerOrnament(FW - ornPad - ornDSize,   FH - ornPad - ornDSize,  -1, -1,  ornDSize, ornArmLen),
  ].join("\n");

  // Línea separadora con diamante central
  const separator = separatorLine(sepY, lineX1, lineX2, ornDSize);

  // Nombres de los novios (dorado, Dancing Script)
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

  // Mensaje (oscuro, Dancing Script, grande)
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

  // Fecha y hora (pequeña, gris cálido)
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

  return sharp(framed)
    .composite([{ input: Buffer.from(svgOverlay), blend: "over" }])
    .webp({ quality: 82 })
    .toBuffer();
}
