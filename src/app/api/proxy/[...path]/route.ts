import { NextRequest, NextResponse } from "next/server";
import { streamFile } from "@/lib/nextcloud";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    const filename  = decodeURIComponent(path.join("/"));
    const { body, contentType, contentLength } = await streamFile(filename);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new NextResponse(body, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No encontrado" },
      { status: 404 }
    );
  }
}
