import { NextResponse } from "next/server";
import { listPhotos } from "@/lib/nextcloud";

export async function GET() {
  try {
    const photos = await listPhotos();
    return NextResponse.json({ photos });
  } catch (err) {
    console.error("[photos]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al cargar fotos" },
      { status: 500 }
    );
  }
}
