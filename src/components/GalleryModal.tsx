"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import type { Photo } from "@/lib/types";

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

// ─── Iconos SVG ──────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GalleryModal({ photos, isOpen, onClose }: Props) {
  const [page, setPage]               = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const touchStartX                   = useRef<number | null>(null);

  const totalPages = Math.ceil(photos.length / PAGE_SIZE);
  const pagePhotos = photos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Teclado: Escape cierra, flechas navegan lightbox ────────────────────
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

  // ── Bloquear scroll del body ─────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Resetear al reabrir ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) { setPage(0); setLightboxIdx(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  // ── Swipe touch en lightbox ──────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0)
        setLightboxIdx((i) => (i !== null ? Math.min(i + 1, photos.length - 1) : null));
      else
        setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null));
    }
    touchStartX.current = null;
  };

  // ── Lightbox ─────────────────────────────────────────────────────────────
  const LightboxView = () => {
    if (lightboxIdx === null) return null;
    const photo = photos[lightboxIdx];
    return (
      <div
        className="absolute inset-0 z-20 flex items-center justify-center bg-black/92"
        onClick={() => setLightboxIdx(null)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Flecha izquierda */}
        <button
          aria-label="Foto anterior"
          disabled={lightboxIdx === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-30
                     w-11 h-11 rounded-full bg-white/12 backdrop-blur-sm
                     flex items-center justify-center text-white/70 hover:text-white
                     hover:bg-white/25 transition-all duration-200 select-none
                     disabled:opacity-20 disabled:cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxIdx((i) => (i !== null ? Math.max(i - 1, 0) : null));
          }}
        >
          <ChevronLeft />
        </button>

        {/* Imagen */}
        <div
          className="relative flex flex-col items-center max-w-5xl mx-16 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullUrl(photo)}
            alt={photo.message ?? "Foto de boda"}
            className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-2xl"
            draggable={false}
          />
          {photo.message && (
            <p className="mt-4 text-white/80 font-lato text-sm text-center max-w-lg px-4 leading-relaxed">
              {photo.message}
            </p>
          )}
          <p className="mt-2 text-white/35 font-lato text-xs tracking-widest">
            {lightboxIdx + 1} &nbsp;/&nbsp; {photos.length}
          </p>
        </div>

        {/* Flecha derecha */}
        <button
          aria-label="Foto siguiente"
          disabled={lightboxIdx === photos.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-30
                     w-11 h-11 rounded-full bg-white/12 backdrop-blur-sm
                     flex items-center justify-center text-white/70 hover:text-white
                     hover:bg-white/25 transition-all duration-200 select-none
                     disabled:opacity-20 disabled:cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxIdx((i) => (i !== null ? Math.min(i + 1, photos.length - 1) : null));
          }}
        >
          <ChevronRight />
        </button>

        {/* Cerrar lightbox */}
        <button
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-30
                     w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm
                     flex items-center justify-center text-white/60 hover:text-white
                     hover:bg-white/25 transition-all duration-200 text-xl leading-none"
          onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
        >
          ×
        </button>
      </div>
    );
  };

  // ── Modal principal ───────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col animate-modal-enter"
      style={{ background: "rgba(28,20,14,0.97)" }}
    >
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
          className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/18
                     flex items-center justify-center text-cream/50 hover:text-cream
                     transition-all duration-200 text-xl leading-none"
        >
          ×
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
                  className="aspect-square relative overflow-hidden rounded-lg cursor-pointer group bg-dark/40
                             animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(i * 35, 400)}ms` }}
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
