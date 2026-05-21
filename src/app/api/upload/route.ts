import { NextRequest, NextResponse } from "next/server";
import { ensureFolder, uploadFile, uploadMeta } from "@/lib/nextcloud";
import { processPolaroid, generateThumbnail } from "@/lib/imageProcessor";

const MAX_INPUT_SIZE  = 50 * 1024 * 1024; // 50 MB (antes de comprimir)
const MAX_CONCURRENT  = 3;                 // máx archivos procesados en paralelo
                                           // (evita picos de RAM con uploads masivos)
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

    // ── 1. Validación y lectura en memoria (serial, instantáneo) ─────────────
    // Verificamos tipo y tamaño antes de lanzar ningún procesamiento.
    // Leer arrayBuffer() es barato porque los datos ya están en la request.
    type ValidFile = { raw: Buffer };
    const valid: ValidFile[] = [];

    for (const file of files) {
      if (!ALLOW_TYPES.has(file.type)) continue;
      if (file.size > MAX_INPUT_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" supera los 50 MB permitidos` },
          { status: 400 }
        );
      }
      valid.push({ raw: Buffer.from(await file.arrayBuffer()) });
    }

    if (!valid.length) {
      return NextResponse.json(
        { error: "Ningún archivo tiene formato de imagen válido" },
        { status: 400 }
      );
    }

    // ── 2. Procesamiento paralelo con pool de workers ─────────────────────────
    //
    // Patrón worker-pool: MAX_CONCURRENT workers sacan items de la cola hasta
    // que se vacía. Esto garantiza que NUNCA haya más de MAX_CONCURRENT imágenes
    // procesándose simultáneamente (control de RAM), mientras maximiza el uso
    // de CPU (un worker empieza la siguiente foto en cuanto termina la anterior).
    //
    // Dentro de cada slot:
    //   - processPolaroid + generateThumbnail corren en PARALELO (Promise.all)
    //     → ambas leen el mismo buffer sin dependencia entre sí.
    //   - Las 3 subidas (polaroid + thumb + meta) también en paralelo.

    const uploaded: string[] = [];
    const queue = [...valid];

    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;

        // Polaroid + thumbnail en paralelo (mayor ganancia individual por archivo)
        const [processed, thumb] = await Promise.all([
          processPolaroid(item.raw, message || undefined),
          generateThumbnail(item.raw),
        ]);

        const ts            = Date.now();
        const rnd           = Math.random().toString(36).slice(2, 8);
        const filename      = `${ts}-${rnd}.webp`;
        const thumbFilename = `${ts}-${rnd}.thumb.webp`;

        // Las 3 subidas en paralelo: Polaroid + thumbnail + sidecar de mensaje
        await Promise.all([
          uploadFile(filename,      processed, "image/webp"),
          uploadFile(thumbFilename, thumb,     "image/webp"),
          message ? uploadMeta(filename, message) : Promise.resolve(),
        ]);

        uploaded.push(filename);
      }
    };

    // Lanzar MAX_CONCURRENT workers simultáneamente
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, valid.length) }, worker)
    );

    return NextResponse.json({ success: true, files: uploaded });
  } catch (err) {
    console.error("[upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
