"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";

interface Props {
  onSuccess: () => void;
}

interface Preview {
  file: File;
  url: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_DIM       = 2048; // px — Sharp reduce aún más en el servidor (≤ 1414)
const CHUNK_SIZE    = 5;    // fotos por request al servidor
const CHUNK_PARALLEL = 2;   // requests enviados simultáneamente
                             // (2 chunks × 5 fotos = 10 fotos procesándose a la vez en servidor)

/** Intenta codificar un Canvas al formato/calidad dados.
 *  Devuelve null si el browser no soporta ese formato. */
function tryEncode(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.size > 0 ? b : null), mime, quality)
  );
}

// ─── Compresión cliente ───────────────────────────────────────────────────────
//
// Pipeline: cualquier formato → WebP 92% (cliente) → servidor → WebP 87% (final)
//
// Beneficios:
//   • Una sola codificación lossy significativa (el servidor solo re-codifica
//     WebP→WebP, mucho menos destructivo que JPEG→JPEG o JPEG→WebP)
//   • WebP no usa bloques DCT fijos de 8×8 → sin el "efecto cuadrícula" de JPEG
//   • Archivos 3-4× más pequeños que el original → upload y servidor más rápidos
//   • { imageOrientation: "from-image" } aplica EXIF antes del draw:
//     el resultado ya está orientado correctamente, Sharp no necesita releer EXIF
//
// HEIC/HEIF:
//   • iOS (Safari / Chrome / Firefox) → todos usan WebKit → createImageBitmap
//     soporta HEIC → se comprime igual que el resto ✅
//   • Desktop Chrome/Firefox → createImageBitmap lanza error → catch →
//     se envía el original (fallback automático, caso muy raro en una boda) ✅
//
async function compressImage(file: File): Promise<File> {

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = bitmap;

    // Redimensionar solo si supera MAX_DIM; si ya es pequeña se mantiene resolución
    const scale = Math.min(1, MAX_DIM / Math.max(width, height));
    const w = Math.round(width  * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // WebP 92% primero; fallback a JPEG 95% para browsers sin soporte WebP toBlob
    const blob = await tryEncode(canvas, "image/webp", 0.92)
               ?? await tryEncode(canvas, "image/jpeg", 0.95);

    // Si el blob es más grande que el original (raro, pero posible en PNGs muy simples)
    // → enviar el original directamente
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
    return new File(
      [blob],
      file.name.replace(/\.[^.]+$/, ext),
      { type: blob.type }
    );
  } catch {
    return file; // ante cualquier error, el servidor siempre puede manejarlo
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function UploadZone({ onSuccess }: Props) {
  const [previews,  setPreviews]  = useState<Preview[]>([]);
  const [message,   setMessage]   = useState("");
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progText,  setProgText]  = useState("");
  const [progPct,   setProgPct]   = useState(0);
  const [status,    setStatus]    = useState<"idle" | "ok" | "err">("idle");
  const [errMsg,    setErrMsg]    = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setPreviews((prev) => [
      ...prev,
      ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
    setStatus("idle");
  }

  function removePreview(i: number) {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (!previews.length || uploading) return;
    setUploading(true);
    setStatus("idle");
    setErrMsg("");

    const total = previews.length;

    try {
      // ── Fase 1 (0 → 50 %): compresión en el browser ──────────────────────
      // Cada foto se procesa en GPU vía Canvas → muy rápido (~50-200 ms/foto)
      const compressed: File[] = [];

      for (let i = 0; i < total; i++) {
        setProgText(`Comprimiendo ${i + 1} de ${total}…`);
        setProgPct(Math.round(((i + 0.5) / total) * 50));
        compressed.push(await compressImage(previews[i].file));
      }

      // ── Fase 2 (50 → 100 %): subida por grupos de chunks en paralelo ────────
      //
      // Enviamos CHUNK_PARALLEL requests simultáneamente al servidor.
      // Cada request procesa hasta CHUNK_SIZE fotos con MAX_CONCURRENT=5 workers.
      // Mientras el servidor sube las fotos del chunk A a NextCloud, ya tiene
      // el chunk B procesándose → CPU y red nunca esperan la una a la otra.
      //
      // Ejemplo para 18 fotos (4 chunks):
      //   Ronda 1: chunk[0] (fotos 1-5)  ┐ en paralelo → ~4 s
      //            chunk[1] (fotos 6-10) ┘
      //   Ronda 2: chunk[2] (fotos 11-15) ┐ en paralelo → ~4 s
      //            chunk[3] (fotos 16-18) ┘
      //   Total: ~8 s  vs  ~16 s con chunks secuenciales

      let done = 0;

      // Construir array de todos los chunks
      const chunks: File[][] = [];
      for (let c = 0; c * CHUNK_SIZE < compressed.length; c++) {
        chunks.push(compressed.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE));
      }

      // Enviar en grupos de CHUNK_PARALLEL
      for (let g = 0; g < chunks.length; g += CHUNK_PARALLEL) {
        const group = chunks.slice(g, g + CHUNK_PARALLEL);
        setProgText(`Subiendo… ${done} de ${total} listas`);
        setProgPct(Math.round(50 + (done / total) * 50));

        await Promise.all(group.map(async (slice) => {
          const form = new FormData();
          slice.forEach((f) => form.append("files", f));
          if (message.trim()) form.append("message", message.trim());

          const res  = await fetch("/api/upload", { method: "POST", body: form });
          const data = await res.json() as { error?: string };
          if (!res.ok) throw new Error(data.error ?? "Error al subir");

          // JS es single-threaded: done += es atómico aquí
          done += slice.length;
          setProgPct(Math.round(50 + (done / total) * 50));
          setProgText(`Subiendo… ${done} de ${total} listas`);
        }));
      }

      // ── Éxito ─────────────────────────────────────────────────────────────
      previews.forEach(({ url }) => URL.revokeObjectURL(url));
      setPreviews([]);
      setMessage("");
      setStatus("ok");
      onSuccess();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Error desconocido");
      setStatus("err");
    } finally {
      setUploading(false);
      setProgText("");
      setProgPct(0);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={(e) => { if (!uploading) onDrop(e); }}
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={[
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-12",
          "text-center select-none transition-[transform,background-color,border-color] duration-300",
          !uploading && "animate-border-glow",
          dragging
            ? "border-gold bg-gold/10 scale-[1.01]"
            : "border-gold/40 bg-white/40 hover:border-gold hover:bg-gold/5",
          uploading && "pointer-events-none opacity-60",
        ].filter(Boolean).join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-4">
          <svg className="w-12 h-12 text-gold/60 animate-icon-float" fill="none" viewBox="0 0 48 48"
               stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M6 34l10-12 7 8 5-6 8 10H6zM34 16a4 4 0 11-8 0 4 4 0 018 0z" />
            <rect x="3" y="8" width="42" height="32" rx="4" strokeLinecap="round" />
          </svg>
          <div>
            <p className="font-playfair text-xl text-warm-brown">Arrastra tus fotos aquí</p>
            <p className="mt-1 text-sm text-warm-brown/50">o haz clic para seleccionar</p>
          </div>
          <p className="text-xs text-warm-brown/30">JPG · PNG · WEBP · HEIC · máx. 50 MB por foto</p>
        </div>
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {previews.map((p, i) => (
            <div
              key={i}
              className="relative group aspect-square transition-transform duration-200
                         hover:[transform:perspective(400px)_rotateY(4deg)_scale(1.03)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt=""
                   className="w-full h-full object-cover rounded-xl shadow-sm" />
              {!uploading && (
                <button
                  onClick={() => removePreview(i)}
                  className="absolute top-1 right-1 flex items-center justify-center
                             w-6 h-6 rounded-full bg-black/50 text-white text-xs
                             opacity-0 group-hover:opacity-100 transition-opacity"
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dedicatoria */}
      <div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={uploading}
          placeholder="Escribe una dedicatoria para los novios… (opcional)"
          maxLength={300}
          rows={3}
          className="w-full rounded-xl border border-gold/30 bg-white/60 px-4 py-3
                     font-lato text-sm text-dark placeholder:text-warm-brown/35
                     focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30
                     resize-none transition-colors duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="text-right text-xs text-warm-brown/35 mt-1">{message.length}/300</p>
      </div>

      {/* Botón + barra de progreso */}
      <div className="space-y-2.5">
        <button
          onClick={handleUpload}
          disabled={!previews.length || uploading}
          className="relative overflow-hidden w-full py-4 rounded-xl bg-gold font-playfair text-white text-lg
                     tracking-wide transition-all duration-300
                     hover:brightness-110 hover:shadow-lg hover:shadow-gold/25
                     active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed
                     group/btn"
        >
          {/* Shimmer en hover */}
          <span
            aria-hidden="true"
            className="absolute inset-0 -skew-x-12 -translate-x-full
                       group-hover/btn:translate-x-full
                       bg-gradient-to-r from-transparent via-white/20 to-transparent
                       transition-transform duration-700 ease-in-out pointer-events-none"
          />
          {uploading ? (
            <span className="flex items-center justify-center gap-2 text-base">
              <span className="inline-block w-4 h-4 border-2 border-white/30
                               border-t-white rounded-full animate-spin shrink-0" />
              {progText || "Preparando…"}
            </span>
          ) : (
            previews.length
              ? `Compartir ${previews.length} foto${previews.length > 1 ? "s" : ""}`
              : "Selecciona fotos"
          )}
        </button>

        {/* Barra de progreso — visible solo durante la carga */}
        <div className={[
          "w-full h-1.5 rounded-full overflow-hidden transition-opacity duration-300",
          uploading ? "opacity-100 bg-gold/15" : "opacity-0",
        ].join(" ")}>
          <div
            className="h-full bg-gold rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progPct}%` }}
          />
        </div>
      </div>

      {/* Resultado */}
      {status === "ok" && (
        <p className="text-center py-3 rounded-xl bg-emerald-50 text-emerald-700
                      text-sm font-lato animate-slide-up-fade">
          ✨ ¡Fotos compartidas! Gracias por ser parte de este momento.
        </p>
      )}
      {status === "err" && (
        <p className="text-center py-3 rounded-xl bg-red-50 text-red-600
                      text-sm font-lato">
          ⚠️ {errMsg}
        </p>
      )}
    </div>
  );
}
