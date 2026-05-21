"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Photo {
  filename: string;
  thumbFilename?: string;
  message?: string;
}

interface Props {
  photos: Photo[];
  onOpenGallery: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const SLOTS       = 12;
const INTERVAL_MS = 3_000;   // 1 foto rota cada 3 s
const FADE_MS     = 1_400;   // duración del crossfade (CSS transition)

// ─── Helper ───────────────────────────────────────────────────────────────────

function thumbUrl(photo: Photo): string {
  const file = photo.thumbFilename ?? photo.filename;
  return `/api/proxy/${encodeURIComponent(file)}`;
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

// ─── Slot con crossfade A/B ───────────────────────────────────────────────────
//
// Dos capas absolutas, apiladas. Una siempre visible (opacity 1) y otra
// invisible (opacity 0). Al cambiar la foto:
//   1. Cargamos la nueva imagen en la capa INACTIVA (todavía opacity 0).
//   2. Después de dos animationFrames (imagen ya en el DOM), invertimos las
//      opacidades con una transición CSS suave → crossfade real, sin corte.
//   3. La capa que quedó en opacity 0 pasa a ser la "inactiva" para el
//      próximo ciclo.
//
// Esto funciona correctamente en iOS Safari porque:
//  - No hay unmount/remount de <Image>.
//  - La transición es solo opacity, que iOS GPU-acelera de forma nativa.

function MosaicSlot({
  photo,
  onClick,
}: {
  photo: Photo | null;
  onClick: () => void;
}) {
  const [layerA, setLayerA] = useState<Photo | null>(photo);
  const [layerB, setLayerB] = useState<Photo | null>(null);
  const [showB, setShowB]   = useState(false);        // false → A visible
  const activeRef           = useRef<"A" | "B">("A"); // qué capa muestra la foto actual
  const prevFilename        = useRef<string | undefined>(photo?.filename);

  useEffect(() => {
    if (!photo) return;
    // Ignorar si la foto no cambió (incluso en React Strict Mode doble-ejecución)
    if (photo.filename === prevFilename.current) return;
    prevFilename.current = photo.filename;

    if (activeRef.current === "A") {
      // Cargar nueva foto en B (invisible)
      setLayerB(photo);
      // Esperar dos frames para que el <img> esté en el DOM
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setShowB(true);       // B → opacity 1  /  A → opacity 0
          activeRef.current = "B";
        })
      );
    } else {
      // Cargar nueva foto en A (invisible)
      setLayerA(photo);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setShowB(false);      // A → opacity 1  /  B → opacity 0
          activeRef.current = "A";
        })
      );
    }
  }, [photo]);

  const fade = { transition: `opacity ${FADE_MS}ms ease-in-out` } as const;

  return (
    <div
      className="aspect-square relative overflow-hidden rounded-xl bg-cream/60 cursor-pointer group"
      onClick={onClick}
    >
      {/* Capa A */}
      <div className="absolute inset-0" style={{ ...fade, opacity: showB ? 0 : 1 }}>
        {layerA && (
          <Image
            src={thumbUrl(layerA)}
            alt={layerA.message ?? "Foto de boda"}
            fill
            className="object-cover group-hover:brightness-110 transition-[filter] duration-300"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
            unoptimized
          />
        )}
      </div>

      {/* Capa B */}
      <div className="absolute inset-0" style={{ ...fade, opacity: showB ? 1 : 0 }}>
        {layerB && (
          <Image
            src={thumbUrl(layerB)}
            alt={layerB.message ?? "Foto de boda"}
            fill
            className="object-cover group-hover:brightness-110 transition-[filter] duration-300"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
            unoptimized
          />
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AnimatedMosaic({ photos, onOpenGallery }: Props) {
  const [slots, setSlots] = useState<(Photo | null)[]>(() =>
    Array(SLOTS).fill(null)
  );

  // Poblar slots con una selección aleatoria al recibir las fotos
  useEffect(() => {
    if (!photos.length) return;
    const shuffled = pickRandom(photos, Math.min(SLOTS, photos.length));
    setSlots(Array.from({ length: SLOTS }, (_, i) => shuffled[i] ?? null));
  }, [photos]);

  // Rotar UN slot aleatorio cada INTERVAL_MS
  const rotate = useCallback(() => {
    if (photos.length <= SLOTS) return;

    setSlots((prev) => {
      const currentNames = new Set(prev.filter(Boolean).map((p) => p!.filename));
      const pool = photos.filter((p) => !currentNames.has(p.filename));
      if (!pool.length) return prev;

      const slotIdx  = Math.floor(Math.random() * SLOTS);
      const newPhoto = pool[Math.floor(Math.random() * pool.length)];
      const next = [...prev];
      next[slotIdx] = newPhoto;
      return next;
    });
  }, [photos]);

  useEffect(() => {
    if (photos.length <= SLOTS) return;
    const timer = setInterval(rotate, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rotate, photos.length]);

  // ── Sin fotos ──────────────────────────────────────────────────────────────
  if (!photos.length) {
    return (
      <div className="text-center py-20">
        <p className="font-lato text-lg text-warm-brown/60">
          Aún no hay fotos. ¡Sé el primero en compartir un momento!
        </p>
      </div>
    );
  }

  // ── Mosaico ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 mb-7">
        {slots.map((photo, i) => (
          <MosaicSlot key={i} photo={photo} onClick={onOpenGallery} />
        ))}
      </div>

      <div className="text-center">
        <button
          onClick={onOpenGallery}
          className="
            font-lato font-medium text-sm
            px-7 py-2.5 rounded-full
            border border-gold text-gold
            hover:bg-gold hover:text-white
            transition-colors duration-200
          "
        >
          Ver todas las fotos ({photos.length})
        </button>
      </div>
    </div>
  );
}
