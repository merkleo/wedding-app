import { NextRequest, NextResponse } from "next/server";
import { streamFile } from "@/lib/nextcloud";

// Solo nombres generados por la app: {timestamp}-{rnd}[.thumb].webp
// y formatos de imagen legacy subidos antes del pipeline WebP.
// Bloquea traversal (../), subcarpetas y sidecars (.meta.json).
const SAFE_NAME = /^[\w-]+(\.thumb)?\.(jpe?g|png|gif|webp|heic|heif|avif)$/i;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;

    // La app siempre referencia archivos planos dentro de la carpeta:
    // más de un segmento = intento de navegar rutas → rechazar
    if (path.length !== 1) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const filename = decodeURIComponent(path[0]);
    if (!SAFE_NAME.test(filename)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const { body, contentType, contentLength } = await streamFile(filename);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new NextResponse(body, { headers });
  } catch (err) {
    console.error("[proxy]", err);
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
