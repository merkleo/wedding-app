"use client";

import { useState, useEffect, useCallback, useId } from "react";
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

const SLOTS        = 12;  // celdas visibles en el mosaico
const ROTATE_COUNT = 4;   // fotos que rotan en cada ciclo
const INTERVAL_MS  = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thumbUrl(photo: Photo): string {
  const file = photo.thumbFilename ?? photo.filename;
  return `/api/proxy/${encodeURIComponent(file)}`;
}

/** Elige N índices aleatorios del arreglo sin repetir */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

// ─── Slot individual (gestiona su propio fade) ────────────────────────────────

function MosaicSlot({
  photo,
  onClick,
}: {
  photo: Photo | null;
  onClick: () => void;
}) {
  // Cada vez que `photo` cambia, se genera un nuevo animKey → remonta la imagen → fade
  const [animKey, setAnimKey] = useState(0);
  const [current, setCurrent] = useState<Photo | null>(photo);

  useEffect(() => {
    if (photo?.filename !== current?.filename) {
      setCurrent(photo);
      setAnimKey((k) => k + 1);
    }
  }, [photo, current?.filename]);

  return (
    <div
      className="aspect-square relative overflow-hidden rounded-xl bg-cream/60 cursor-pointer group"
      onClick={onClick}
    >
      {current && (
        <Image
          key={animKey}
          src={thumbUrl(current)}
          alt={current.message ?? "Foto de boda"}
          fill
          className="object-cover mosaic-fade group-hover:brightness-110 transition-[filter] duration-300"
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
          unoptimized
        />
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AnimatedMosaic({ photos, onOpenGallery }: Props) {
  // Estado: qué foto ocupa cada slot (null = vacío)
  const [slots, setSlots] = useState<(Photo | null)[]>(() =>
    Array(SLOTS).fill(null)
  );

  // Inicializar slots cuando llegan las fotos
  useEffect(() => {
    if (!photos.length) return;
    const shuffled = pickRandom(photos, Math.min(SLOTS, photos.length));
    setSlots(
      Array.from({ length: SLOTS }, (_, i) => shuffled[i] ?? null)
    );
  }, [photos]);

  // Rotar algunas celdas cada INTERVAL_MS (solo si hay fotos fuera del mosaico)
  const rotate = useCallback(() => {
    if (photos.length <= SLOTS) return;

    setSlots((prev) => {
      const next = [...prev];
      const currentNames = new Set(
        next.filter(Boolean).map((p) => p!.filename)
      );
      const pool = photos.filter((p) => !currentNames.has(p.filename));
      if (!pool.length) return prev;

      const replacements = pickRandom(pool, Math.min(ROTATE_COUNT, pool.length));
      // Índices de slots a reemplazar (aleatorios)
      const slotIdxs = pickRandom(
        Array.from({ length: SLOTS }, (_, i) => i),
        replacements.length
      );

      slotIdxs.forEach((si, j) => {
        next[si] = replacements[j];
      });

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
      {/* Grid 3 cols en móvil, 4 en tablet+ */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 mb-7">
        {slots.map((photo, i) => (
          <MosaicSlot key={i} photo={photo} onClick={onOpenGallery} />
        ))}
      </div>

      {/* Botón "Ver todas" */}
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
