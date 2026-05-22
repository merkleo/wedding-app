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
const INTERVAL_MS = 3_000;   // una foto rota cada 3 s
const FADE_MS     = 2_400;   // crossfade

// ─── Layout editorial sin huecos ─────────────────────────────────────────────
//
// Cada entrada: [cols-mobile (grid 3-col), cols-desktop (grid 4-col)]
//
// Desktop 4-col (sin huecos):
//   Fila 1: [2][2]       slots 0,1
//   Fila 2: [1][2][1]    slots 2,3,4
//   Fila 3: [2][2]       slots 5,6
//   Fila 4: [1][2][1]    slots 7,8,9
//   Fila 5: [2][2]       slots 10,11
//
// Mobile 3-col (sin huecos):
//   Fila 1: [2][1]       slots 0,1
//   Fila 2: [1][2]       slots 2,3
//   Fila 3: [2][1]       slots 4,5
//   Fila 4: [1][2]       slots 6,7
//   Fila 5: [2][1]       slots 8,9
//   Fila 6: [1][2]       slots 10,11

const SLOT_SPANS: [number, number][] = [
  [2, 2], // 0
  [1, 2], // 1
  [1, 1], // 2
  [2, 2], // 3
  [2, 1], // 4
  [1, 2], // 5
  [1, 2], // 6
  [2, 1], // 7
  [2, 2], // 8
  [1, 1], // 9
  [1, 2], // 10
  [2, 2], // 11
];

// Strings completos para que Tailwind no los elimine en el purge
const SPAN_CLASSES: Record<string, string> = {
  "1-1": "col-span-1 sm:col-span-1",
  "1-2": "col-span-1 sm:col-span-2",
  "2-1": "col-span-2 sm:col-span-1",
  "2-2": "col-span-2 sm:col-span-2",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function preloadImage(src: string, onReady: () => void): () => void {
  let cancelled = false;
  let called    = false;
  const once = () => { if (!cancelled && !called) { called = true; onReady(); } };
  const img    = new window.Image();
  img.onload  = once;
  img.onerror = once;
  img.src      = src;
  if (img.complete) once();
  return () => { cancelled = true; };
}

// ─── Slot con crossfade A/B + Ken Burns ──────────────────────────────────────

function MosaicSlot({
  photo,
  onClick,
  spanClass,
  panDir,
}: {
  photo:     Photo | null;
  onClick:   () => void;
  spanClass: string;
  panDir:    "down" | "up";
}) {
  const [layerA, setLayerA] = useState<Photo | null>(photo);
  const [layerB, setLayerB] = useState<Photo | null>(null);
  const [showB,  setShowB]  = useState(false);
  const activeRef            = useRef<"A" | "B">("A");
  const prevFilename         = useRef<string | undefined>(photo?.filename);

  useEffect(() => {
    if (!photo) return;
    if (photo.filename === prevFilename.current) return;

    const src    = thumbUrl(photo);
    const target = activeRef.current === "A" ? "B" : "A";

    const cancel = preloadImage(src, () => {
      prevFilename.current = photo.filename;
      if (target === "B") {
        setLayerB(photo);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => { setShowB(true); activeRef.current = "B"; })
        );
      } else {
        setLayerA(photo);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => { setShowB(false); activeRef.current = "A"; })
        );
      }
    });

    return cancel;
  }, [photo]);

  const layerStyle = {
    willChange: "opacity",
    transition: `opacity ${FADE_MS}ms ease-in-out`,
  } as const;

  // Barrido vertical alterno — cada slot barre en dirección opuesta al anterior
  const panClass = panDir === "down" ? "animate-pan-down" : "animate-pan-up";

  // Altura fija para alinear filas: las fotos se estiran horizontalmente
  // según su col-span sin que el alto de la fila quede descompensado
  const outerClass = [
    spanClass,
    "h-32 sm:h-44",
    "relative overflow-hidden rounded-xl bg-cream/60 cursor-pointer group",
  ].join(" ");

  return (
    <div className={outerClass} onClick={onClick}>

      {/* Capa A */}
      <div className="absolute inset-0" style={{ ...layerStyle, opacity: showB ? 0 : 1 }}>
        {layerA && (
          <Image
            src={thumbUrl(layerA)}
            alt={layerA.message ?? "Foto de boda"}
            fill
            loading="eager"
            className={`object-cover group-hover:brightness-110 transition-[filter] duration-300 ${panClass}`}
            sizes="(max-width: 640px) 66vw, 50vw"
            unoptimized
          />
        )}
      </div>

      {/* Capa B */}
      <div className="absolute inset-0" style={{ ...layerStyle, opacity: showB ? 1 : 0 }}>
        {layerB && (
          <Image
            src={thumbUrl(layerB)}
            alt={layerB.message ?? "Foto de boda"}
            fill
            loading="eager"
            className={`object-cover group-hover:brightness-110 transition-[filter] duration-300 ${panClass}`}
            sizes="(max-width: 640px) 66vw, 50vw"
            unoptimized
          />
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AnimatedMosaic({ photos, onOpenGallery }: Props) {
  const [slots, setSlots] = useState<(Photo | null)[]>(() =>
    Array(SLOTS).fill(null)
  );
  const mosaicRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  // Poblar slots al recibir las fotos
  useEffect(() => {
    if (!photos.length) return;
    const shuffled = pickRandom(photos, Math.min(SLOTS, photos.length));
    setSlots(Array.from({ length: SLOTS }, (_, i) => shuffled[i] ?? null));
  }, [photos]);

  // IntersectionObserver — pausar cuando sale de pantalla
  useEffect(() => {
    const el = mosaicRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => { pausedRef.current = !entry.isIntersecting; },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Page Visibility API — pausar cuando la pestaña está en background
  useEffect(() => {
    const onVisibility = () => { pausedRef.current = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Rotar 1 slot aleatorio cada INTERVAL_MS
  const rotate = useCallback(() => {
    if (pausedRef.current) return;
    if (photos.length <= SLOTS) return;

    setSlots((prev) => {
      const currentNames = new Set(prev.filter(Boolean).map((p) => p!.filename));
      const pool = photos.filter((p) => !currentNames.has(p.filename));
      if (!pool.length) return prev;

      const slotIdx  = Math.floor(Math.random() * SLOTS);
      const newPhoto = pool[Math.floor(Math.random() * pool.length)];
      const next     = [...prev];
      next[slotIdx]  = newPhoto;
      return next;
    });
  }, [photos]);

  useEffect(() => {
    if (photos.length <= SLOTS) return;
    const timer = setInterval(rotate, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rotate, photos.length]);

  // Sin fotos
  if (!photos.length) {
    return (
      <div className="text-center py-20">
        <p className="font-lato text-lg text-warm-brown/60">
          Aún no hay fotos. ¡Sé el primero en compartir un momento!
        </p>
      </div>
    );
  }

  return (
    <div ref={mosaicRef}>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 mb-7">
        {slots.map((photo, i) => {
          const [mob, desk] = SLOT_SPANS[i] ?? [1, 1];
          const spanCls = SPAN_CLASSES[`${mob}-${desk}`] ?? "col-span-1";
          return (
            <MosaicSlot
              key={i}
              photo={photo}
              onClick={onOpenGallery}
              spanClass={spanCls}
              panDir={i % 2 === 0 ? "down" : "up"}
            />
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={onOpenGallery}
          className="
            relative overflow-hidden group/gallery
            font-lato font-medium text-sm
            px-7 py-2.5 rounded-full
            border border-gold text-gold
            hover:bg-gold hover:text-white
            transition-colors duration-200
          "
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 -skew-x-12 -translate-x-full
                       group-hover/gallery:translate-x-full
                       bg-gradient-to-r from-transparent via-gold/25 to-transparent
                       transition-transform duration-600 ease-in-out pointer-events-none"
          />
          Ver todas las fotos ({photos.length})
        </button>
      </div>
    </div>
  );
}
