import { NextRequest, NextResponse } from "next/server";
import { ensureFolder, uploadFile, uploadMeta } from "@/lib/nextcloud";
import { processPolaroid, generateThumbnail } from "@/lib/imageProcessor";

const MAX_INPUT_SIZE = 50 * 1024 * 1024; // 50 MB (antes de comprimir)
const ALLOW_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/heic", "image/heif", "image/avif",
]);

export async function POST(req: NextRequest) {
  try {
    const form    = await req.formData();
    const files   = form.getAll("files") as File[];
    const message = (form.get("message") as string | null)?.trim() ?? "";

    if (!files.length) {
      return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 });
    }

    await ensureFolder();

    const uploaded: string[] = [];

    for (const file of files) {
      if (!ALLOW_TYPES.has(file.type)) continue;
      if (file.size > MAX_INPUT_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" supera los 50 MB permitidos` },
          { status: 400 }
        );
      }

      const raw = Buffer.from(await file.arrayBuffer());

      // Procesar: resize 2MP + efecto Polaroid + marco + texto → WebP
      const processed = await processPolaroid(raw, message || undefined);

      const ts       = Date.now();
      const rnd      = Math.random().toString(36).slice(2, 8);
      const filename = `${ts}-${rnd}.webp`;      // siempre WebP

      // Thumbnail cuadrado 400×400 (sin marco Polaroid) para la galería
      const thumb         = await generateThumbnail(raw);
      const thumbFilename = `${ts}-${rnd}.thumb.webp`;

      await Promise.all([
        uploadFile(filename,      processed, "image/webp"),
        uploadFile(thumbFilename, thumb,     "image/webp"),
      ]);

      // Guardar el mensaje también como metadata (para el lightbox)
      if (message) await uploadMeta(filename, message);

      uploaded.push(filename);
    }

    return NextResponse.json({ success: true, files: uploaded });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
