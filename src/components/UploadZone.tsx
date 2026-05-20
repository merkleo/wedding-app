"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";

interface Props {
  onSuccess: () => void;
}

interface Preview {
  file: File;
  url: string;
}

export default function UploadZone({ onSuccess }: Props) {
  const [previews,   setPreviews]   = useState<Preview[]>([]);
  const [message,    setMessage]    = useState("");
  const [dragging,   setDragging]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [status,     setStatus]     = useState<"idle" | "ok" | "err">("idle");
  const [errMsg,     setErrMsg]     = useState("");
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
    if (!previews.length) return;
    setUploading(true);
    setStatus("idle");
    setErrMsg("");

    try {
      const form = new FormData();
      previews.forEach(({ file }) => form.append("files", file));
      if (message.trim()) form.append("message", message.trim());

      const res  = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json() as { error?: string };

      if (!res.ok) throw new Error(data.error ?? "Error al subir");

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
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5">
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={[
          "relative cursor-pointer rounded-2xl border-2 border-dashed p-12",
          "text-center select-none transition-all duration-300",
          dragging
            ? "border-gold bg-gold/10 scale-[1.01]"
            : "border-gold/40 bg-white/40 hover:border-gold hover:bg-gold/5",
        ].join(" ")}
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
          <svg className="w-12 h-12 text-gold/60" fill="none" viewBox="0 0 48 48" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M6 34l10-12 7 8 5-6 8 10H6zM34 16a4 4 0 11-8 0 4 4 0 018 0z" />
            <rect x="3" y="8" width="42" height="32" rx="4" strokeLinecap="round" />
          </svg>
          <div>
            <p className="font-playfair text-xl text-warm-brown">Arrastra tus fotos aquí</p>
            <p className="mt-1 text-sm text-warm-brown/50">o haz clic para seleccionar</p>
          </div>
          <p className="text-xs text-warm-brown/30">JPG · PNG · WEBP · HEIC · máx. 25 MB por foto</p>
        </div>
      </div>

      {/* Previews */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {previews.map((p, i) => (
            <div key={i} className="relative group aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full h-full object-cover rounded-xl shadow-sm" />
              <button
                onClick={() => removePreview(i)}
                className="absolute top-1 right-1 flex items-center justify-center
                           w-6 h-6 rounded-full bg-black/50 text-white text-xs
                           opacity-0 group-hover:opacity-100 transition-opacity"
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Message */}
      <div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe una dedicatoria para los novios… (opcional)"
          maxLength={300}
          rows={3}
          className="w-full rounded-xl border border-gold/30 bg-white/60 px-4 py-3
                     font-lato text-sm text-dark placeholder:text-warm-brown/35
                     focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30
                     resize-none transition-colors duration-200"
        />
        <p className="text-right text-xs text-warm-brown/35 mt-1">{message.length}/300</p>
      </div>

      {/* Button */}
      <button
        onClick={handleUpload}
        disabled={!previews.length || uploading}
        className="w-full py-4 rounded-xl bg-gold font-playfair text-white text-lg
                   tracking-wide transition-all duration-300
                   hover:brightness-110 hover:shadow-lg hover:shadow-gold/25
                   active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white
                             rounded-full animate-spin" />
            Subiendo…
          </span>
        ) : (
          previews.length
            ? `Compartir ${previews.length} foto${previews.length > 1 ? "s" : ""}`
            : "Selecciona fotos"
        )}
      </button>

      {/* Status */}
      {status === "ok" && (
        <p className="text-center py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-lato">
          ✨ ¡Fotos compartidas! Gracias por ser parte de este momento.
        </p>
      )}
      {status === "err" && (
        <p className="text-center py-3 rounded-xl bg-red-50 text-red-600 text-sm font-lato">
          ⚠️ {errMsg}
        </p>
      )}
    </div>
  );
}
