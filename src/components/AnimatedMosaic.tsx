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
const FADE_MS     = 2_400;   // crossfade más largo = más suave

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

/**
 * Precarga una imagen en la caché del navegador ANTES de hacer el crossfade.
 * Llama a onReady() cuando la imagen está lista (o ante error, para no bloquear).
 * Devuelve una función de cancelación para el cleanup de useEffect.
 */
function preloadImage(src: string, onReady: () => void): () => void {
  let cancelled = false;
  let called    = false;

  const once = () => {
    if (!cancelled && !called) { called = true; onReady(); }
  };

  const img    = new window.Image();
  img.onload  = once;
  img.onerror = once;   // si hay error, seguimos igualmente
  img.src      = src;

  // Si ya estaba en caché el navegador la marca complete de forma síncrona
  if (img.complete) once();

  return () => { cancelled = true; };
}

// ─── Slot individual con crossfade A/B ───────────────────────────────────────
//
// Dos capas absolutas apiladas. Al recibir una foto nueva:
//   1. Precargamos la imagen en la caché del navegador.
//   2. Sólo cuando está lista, la ponemos en la capa INACTIVA (opacity 0).
//   3. Tras dos animationFrames (imagen ya renderizada), invertimos opacidades
//      con CSS transition → crossfade real, sin cortes, sin blanco intermedio.

function MosaicSlot({
  photo,
  onClick,
  featured = false,
}: {
  photo: Photo | null;
  onClick: () => void;
  featured?: boolean;
}) {
  const [layerA, setLayerA] = useState<Photo | null>(photo);
  const [layerB, setLayerB] = useState<Photo | null>(null);
  const [showB, setShowB]   = useState(false);
  const activeRef           = useRef<"A" | "B">("A");
  // Sólo se actualiza cuando el swap realmente ocurre (no antes)
  const prevFilename        = useRef<string | undefined>(photo?.filename);

  useEffect(() => {
    if (!photo) return;
    if (photo.filename === prevFilename.current) return;

    const src    = thumbUrl(photo);
    const target = activeRef.current === "A" ? "B" : "A"; // capa inactiva

    const cancel = preloadImage(src, () => {
      // La imagen ya está en caché → colocarla en la capa inactiva
      prevFilename.current = photo.filename;

      if (target === "B") {
        setLayerB(photo);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setShowB(true);          // B → opacity 1  /  A → opacity 0
            activeRef.current = "B";
          })
        );
      } else {
        setLayerA(photo);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setShowB(false);         // A → opacity 1  /  B → opacity 0
            activeRef.current = "A";
          })
        );
      }
    });

    return cancel; // cancela si el componente se desmonta o cambia la foto
  }, [photo]);

  // will-change: opacity → el navegador promueve el elemento a su propia capa
  // GPU → sin jank en iOS incluso con muchos slots animando a la vez
  const layerStyle = {
    willChange: "opacity",
    transition: `opacity ${FADE_MS}ms ease-in-out`,
  } as const;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl bg-cream/60 cursor-pointer group",
        featured ? "absolute inset-0" : "aspect-square",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Capa A */}
      <div className="absolute inset-0" style={{ ...layerStyle, opacity: showB ? 0 : 1 }}>
        {layerA && (
          <Image
            src={thumbUrl(layerA)}
            alt={layerA.message ?? "Foto de boda"}
            fill
            loading="eager"
            className="object-cover group-hover:brightness-110 transition-[filter] duration-300"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
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
  const mosaicRef = useRef<HTMLDivElement>(null);

  // pausedRef: true cuando el mosaico está fuera de pantalla o la pestaña inactiva
  // Usamos ref (no state) para no causar re-renders en el observer
  const pausedRef = useRef(false);

  // Poblar slots al recibir las fotos
  useEffect(() => {
    if (!photos.length) return;
    const shuffled = pickRandom(photos, Math.min(SLOTS, photos.length));
    setSlots(Array.from({ length: SLOTS }, (_, i) => shuffled[i] ?? null));
  }, [photos]);

  // ── IntersectionObserver: pausar cuando el mosaico sale de pantalla ──────
  // Ahorra CPU/batería en mobile cuando el usuario sube a la sección de upload
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

  // ── Page Visibility API: pausar cuando la pestaña está en background ──────
  // Evita que el timer consuma recursos con la app en segundo plano
  useEffect(() => {
    const onVisibility = () => { pausedRef.current = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ── Rotar 1 slot aleatorio cada INTERVAL_MS ───────────────────────────────
  const rotate = useCallback(() => {
    if (pausedRef.current) return;          // fuera de pantalla o tab inactiva
    if (photos.length <= SLOTS) return;     // no hay fotos extra para rotar

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

  // ── Sin fotos ─────────────────────────────────────────────────────────────
  if (!photos.length) {
    return (
      <div className="text-center py-20">
        <p className="font-lato text-lg text-warm-brown/60">
          Aún no hay fotos. ¡Sé el primero en compartir un momento!
        </p>
      </div>
    );
  }

  // ── Mosaico ───────────────────────────────────────────────────────────────
  return (
    <div ref={mosaicRef}>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 mb-7">
        {/* Slot 0 — foto destacada 2×2 */}
        <div key={0} className="col-span-2 row-span-2 relative">
          <MosaicSlot photo={slots[0]} onClick={onOpenGallery} featured />
        </div>
        {/* Slots 1-11 — cuadrícula normal */}
        {slots.slice(1).map((photo, i) => (
          <MosaicSlot key={i + 1} photo={photo} onClick={onOpenGallery} />
        ))}
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
          {/* Shimmer en hover */}
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
