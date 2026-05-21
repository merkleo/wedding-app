"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Photo {
  filename: string;
  thumbFilename?: string;
  message?: string;
  uploadedAt: string;
}

interface Props {
  photos: Photo[];
  isOpen: boolean;
  onClose: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── URLs ─────────────────────────────────────────────────────────────────────

function thumbUrl(photo: Photo): string {
  const file = photo.thumbFilename ?? photo.filename;
  return `/api/proxy/${encodeURIComponent(file)}`;
}

function fullUrl(photo: Photo): string {
  return `/api/proxy/${encodeURIComponent(photo.filename)}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GalleryModal({ photos, isOpen, onClose }: Props) {
  const [page, setPage] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const totalPages = Math.ceil(photos.length / PAGE_SIZE);
  const pagePhotos = photos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Teclado: Escape cierra, flechas navegan en lightbox
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxIdx !== null) setLightboxIdx(null);
        else onClose();
        return;
      }
      if (lightboxIdx === null) return;
      if (e.key === "ArrowRight")
        setLightboxIdx((i) => (i !== null ? Math.min(i + 1, photos.length - 1) : null));
      if (e.key === "ArrowLeft")
        setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null));
    },
    [lightboxIdx, onClose, photos.length]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Resetear página cuando se abre de nuevo
  useEffect(() => {
    if (isOpen) { setPage(0); setLightboxIdx(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Lightbox ─────────────────────────────────────────────────────────────
  const LightboxView = () => {
    if (lightboxIdx === null) return null;
    const photo = photos[lightboxIdx];
    return (
      <div
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/92"
        onClick={() => setLightboxIdx(null)}
      >
        {/* Flecha izquierda */}
        <button
          aria-label="Foto anterior"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-30
                     text-white/60 hover:text-white text-5xl leading-none
                     transition-colors select-none"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null));
          }}
        >
          ‹
        </button>

        {/* Imagen */}
        <div
          className="relative flex flex-col items-center max-w-5xl mx-12"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullUrl(photo)}
            alt={photo.message ?? "Foto de boda"}
            className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
          />
          {photo.message && (
            <p className="mt-3 text-white/80 font-lato text-sm text-center max-w-lg px-2">
              {photo.message}
            </p>
          )}
          <p className="mt-1 text-white/35 font-lato text-xs">
            {lightboxIdx + 1} / {photos.length}
          </p>
        </div>

        {/* Flecha derecha */}
        <button
          aria-label="Foto siguiente"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-30
                     text-white/60 hover:text-white text-5xl leading-none
                     transition-colors select-none"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxIdx((i) =>
              i !== null ? Math.min(i + 1, photos.length - 1) : null
            );
          }}
        >
          ›
        </button>

        {/* Cerrar lightbox */}
        <button
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-30 text-white/50 hover:text-white
                     text-3xl leading-none transition-colors"
          onClick={() => setLightboxIdx(null)}
        >
          &times;
        </button>
      </div>
    );
  };

  // ── Modal principal ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(28,20,14,0.97)" }}>

      {/* Header */}
      <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-gold/20">
        <div>
          <h2 className="font-playfair text-2xl text-cream leading-tight">
            Galería de Momentos
          </h2>
          <p className="font-lato text-xs text-warm-brown/60 mt-0.5">
            {photos.length} {photos.length === 1 ? "foto" : "fotos"}
          </p>
        </div>
        <button
          aria-label="Cerrar galería"
          onClick={onClose}
          className="text-cream/50 hover:text-cream transition-colors text-3xl leading-none"
        >
          &times;
        </button>
      </div>

      {/* Grid de thumbnails */}
      <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-5">
        {photos.length === 0 ? (
          <p className="text-center text-cream/30 py-24 font-lato">
            No hay fotos aún.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-w-7xl mx-auto">
            {pagePhotos.map((photo, i) => {
              const globalIdx = page * PAGE_SIZE + i;
              return (
                <div
                  key={photo.filename}
                  className="aspect-square relative overflow-hidden rounded-lg cursor-pointer group bg-dark/40"
                  onClick={() => setLightboxIdx(globalIdx)}
                >
                  <Image
                    src={thumbUrl(photo)}
                    alt={photo.message ?? ""}
                    fill
                    className="object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105
                               transition-all duration-300"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    unoptimized
                  />
                  {/* Mensaje en hover */}
                  {photo.message && (
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent
                                    opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-2.5">
                      <p className="text-white font-lato text-xs line-clamp-3 leading-snug">
                        {photo.message}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex-none flex items-center justify-center gap-4 px-5 py-4 border-t border-gold/20">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-5 py-1.5 rounded-full border border-gold/40 text-gold font-lato text-sm
                       disabled:opacity-25 hover:bg-gold/10 transition-colors"
          >
            ← Anterior
          </button>
          <span className="font-lato text-sm text-cream/50">
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page === totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-5 py-1.5 rounded-full border border-gold/40 text-gold font-lato text-sm
                       disabled:opacity-25 hover:bg-gold/10 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Lightbox (sobre el modal) */}
      <LightboxView />
    </div>
  );
}
