"use client";

import { useState, useEffect, useCallback } from "react";
import UploadZone from "./UploadZone";
import AnimatedMosaic from "./AnimatedMosaic";
import GalleryModal from "./GalleryModal";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Photo {
  filename: string;
  thumbFilename?: string;
  uploadedAt: string;
  message?: string;
  contentType: string;
  size: number;
}

// ─── Helpers visuales ─────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center justify-center gap-3 my-8">
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-gold/40" />
      <span className="text-gold/50 text-sm select-none">❖</span>
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-gold/40" />
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function PageContent() {
  const [photos, setPhotos]     = useState<Photo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch("/api/photos");
      if (res.ok) {
        const data = await res.json() as { photos: Photo[] };
        setPhotos(data.photos ?? []);
      }
    } catch {
      /* silencioso — el usuario verá el mosaico vacío */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleUploadSuccess = useCallback(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  return (
    <>
      {/* ── Sección de carga ─────────────────────────────────────────────── */}
      <section className="px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="font-playfair text-3xl text-dark">Comparte tu Momento</h2>
          <Divider />
        </div>
        <UploadZone onSuccess={handleUploadSuccess} />
      </section>

      {/* ── Sección de galería ───────────────────────────────────────────── */}
      <section className="px-4 py-12 bg-white/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-playfair text-3xl text-dark">Galería de Momentos</h2>
            <Divider />
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <AnimatedMosaic
              photos={photos}
              onOpenGallery={() => setModalOpen(true)}
            />
          )}
        </div>
      </section>

      {/* ── Modal de galería completa ────────────────────────────────────── */}
      <GalleryModal
        photos={photos}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
