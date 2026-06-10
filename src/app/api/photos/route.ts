import { NextResponse } from "next/server";
import { listPhotos } from "@/lib/nextcloud";

export async function GET() {
  try {
    const photos = await listPhotos();
    return NextResponse.json({ photos });
  } catch (err) {
    // El detalle solo va al log del servidor, nunca al cliente
    console.error("[photos]", err);
    return NextResponse.json(
      { error: "Error al cargar las fotos" },
      { status: 500 }
    );
  }
}
