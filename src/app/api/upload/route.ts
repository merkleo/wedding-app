import { NextRequest, NextResponse } from "next/server";
import { ensureFolder, uploadFile, uploadMeta } from "@/lib/nextcloud";

const MAX_SIZE    = 25 * 1024 * 1024; // 25 MB
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
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" supera los 25 MB permitidos` },
          { status: 400 }
        );
      }

      const buf      = Buffer.from(await file.arrayBuffer());
      const ts       = Date.now();
      const rnd      = Math.random().toString(36).slice(2, 8);
      const ext      = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `${ts}-${rnd}.${ext}`;

      await uploadFile(filename, buf, file.type);
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
