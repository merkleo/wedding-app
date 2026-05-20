"use client";

import { useState, useEffect, useCallback } from "react";

interface Photo {
  filename: string;
  uploadedAt: string;
  message?: string;
  contentType: string;
  size: number;
}

export default function Gallery({ refreshKey }: { refreshKey: number }) {
  const [photos,   setPhotos]   = useState<Photo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [selected, setSelected] = useState<Photo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/photos");
      const data = await res.json() as { photos?: Photo[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setPhotos(data.photos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return (
    <div className="text-center py-20 text-warm-brown/50 font-lato">
      <span className="inline-block w-8 h-8 border-2 border-gold/30 border-t-gold
                       rounded-full animate-spin mb-4" />
      <p>Cargando momentos…</p>
    </div>
  );

  if (error) return (
    <div className="text-center py-20 font-lato">
      <p className="text-red-500">{error}</p>
      <button onClick={load} className="mt-4 text-gold underline hover:no-underline text-sm">
        Reintentar
      </button>
    </div>
  );

  if (!photos.length) return (
    <div className="text-center py-20 text-warm-brown/40 font-lato">
      <p className="text-4xl mb-4">📷</p>
      <p>Sé el primero en compartir un momento.</p>
    </div>
  );

  return (
    <>
      <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
        {photos.map((photo) => (
          <div
            key={photo.filename}
            onClick={() => setSelected(photo)}
            className="break-inside-avoid cursor-pointer group relative rounded-2xl
                       overflow-hidden shadow-sm hover:shadow-xl
                       transition-all duration-300 hover:scale-[1.02]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/proxy/${encodeURIComponent(photo.filename)}`}
              alt=""
              className="w-full object-cover"
              loading="lazy"
            />
            {photo.message && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent
                              to-transparent opacity-0 group-hover:opacity-100
                              transition-opacity duration-300 flex items-end p-3">
                <p className="text-white text-xs font-lato leading-snug line-clamp-3 italic">
                  "{photo.message}"
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <button
            onClick={() => setSelected(null)}
            className="absolute top-5 right-5 text-white/60 hover:text-white
                       text-3xl leading-none transition-colors"
          >×</button>
          <div
            className="max-w-4xl max-h-[90dvh] flex flex-col items-center gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/proxy/${encodeURIComponent(selected.filename)}`}
              alt=""
              className="max-w-full max-h-[72dvh] object-contain rounded-2xl"
            />
            {selected.message && (
              <p className="font-playfair text-lg text-white/90 italic text-center max-w-lg px-4">
                "{selected.message}"
              </p>
            )}
            <p className="text-white/30 text-xs font-lato">
              {new Date(selected.uploadedAt).toLocaleDateString("es-ES", {
                day: "numeric", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
