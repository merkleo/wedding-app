import { NextRequest, NextResponse } from "next/server";
import { ensureFolder, uploadFile, uploadMeta } from "@/lib/nextcloud";
import { processPolaroid, generateThumbnail } from "@/lib/imageProcessor";

const MAX_INPUT_SIZE = 50 * 1024 * 1024; // 50 MB (antes de comprimir)

// El cliente envía chunks de 5 fotos; 20 da margen holgado y evita que
// un request malicioso con cientos de archivos agote RAM/CPU del servidor.
const MAX_FILES_PER_REQUEST = 20;

// Coincide con maxLength={300} del textarea — el límite del cliente es
// solo UX, este es el que realmente protege.
const MAX_MESSAGE_LENGTH = 300;

// Con archivos WebP comprimidos en cliente (~400-700 KB), la RAM por foto es mínima.
// Subimos a 5 para procesar el chunk entero de una vez sin esperas entre fotos.
const MAX_CONCURRENT = 5;

const ALLOW_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif",
  "image/webp", "image/heic", "image/heif", "image/avif",
]);

export async function POST(req: NextRequest) {
  try {
    const form    = await req.formData();
    const files   = form.getAll("files") as File[];
    const message = ((form.get("message") as string | null)?.trim() ?? "")
      .slice(0, MAX_MESSAGE_LENGTH);

    if (!files.length) {
      return NextResponse.json({ error: "No se recibieron archivos" }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Máximo ${MAX_FILES_PER_REQUEST} fotos por envío` },
        { status: 400 }
      );
    }

    await ensureFolder();

    // ── 1. Validación y lectura en memoria ────────────────────────────────────
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

    // ── 2. Worker-pool con uploads desacoplados del procesamiento ─────────────
    //
    // PATRÓN ANTERIOR (cuello de botella):
    //   worker: [⚙️ procesar] → AWAIT [⬆️ subir a NextCloud] → [⚙️ procesar siguiente]
    //   → CPU inactivo mientras espera la red. Con 3 workers y 5 fotos: ~8 s.
    //
    // PATRÓN NUEVO (CPU + red en paralelo):
    //   worker: [⚙️ procesar] → DISPARA upload sin await → [⚙️ procesar siguiente]
    //   → los uploads corren en background mientras se procesa la siguiente foto.
    //   → al final se espera que todos los uploads pendientes terminen.
    //   Con 5 workers y 5 fotos: ~4 s (todos procesan al mismo tiempo y
    //   todos los uploads se disparan juntos al terminar el procesamiento).

    const uploaded: string[] = [];
    const pendingUploads: Promise<void>[] = [];
    const queue = [...valid];

    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;

        // Polaroid + thumbnail en paralelo (no tienen dependencia entre sí)
        const [processed, thumb] = await Promise.all([
          processPolaroid(item.raw, message || undefined),
          generateThumbnail(item.raw),
        ]);

        const ts            = Date.now();
        const rnd           = Math.random().toString(36).slice(2, 8);
        const filename      = `${ts}-${rnd}.webp`;
        const thumbFilename = `${ts}-${rnd}.thumb.webp`;

        // CLAVE: disparar las 3 subidas a NextCloud SIN await.
        // El worker pasa inmediatamente a procesar la siguiente foto.
        // CPU y red trabajan simultáneamente en lugar de secuencialmente.
        pendingUploads.push(
          Promise.all([
            uploadFile(filename,      processed, "image/webp"),
            uploadFile(thumbFilename, thumb,     "image/webp"),
            message ? uploadMeta(filename, message) : Promise.resolve(),
          ]).then(() => { uploaded.push(filename); })
        );
      }
    };

    // Lanzar MAX_CONCURRENT workers en paralelo
    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, valid.length) }, worker)
    );

    // Esperar que todos los uploads en vuelo terminen antes de responder
    await Promise.all(pendingUploads);

    return NextResponse.json({ success: true, files: uploaded });
  } catch (err) {
    // El detalle (URLs internas de NextCloud, respuestas WebDAV) solo va al log
    console.error("[upload]", err);
    return NextResponse.json(
      { error: "No se pudieron procesar las fotos. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
