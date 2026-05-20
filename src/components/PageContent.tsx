"use client";

import { useState } from "react";
import UploadZone from "./UploadZone";
import Gallery from "./Gallery";

function Divider() {
  return (
    <div className="flex items-center justify-center gap-3 my-10">
      <div className="h-px w-20 bg-gradient-to-r from-transparent to-gold/40" />
      <span className="text-gold/50 text-sm select-none">❖</span>
      <div className="h-px w-20 bg-gradient-to-l from-transparent to-gold/40" />
    </div>
  );
}

export default function PageContent() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      {/* Upload */}
      <section className="px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="font-playfair text-3xl text-dark">Comparte tu Momento</h2>
          <Divider />
        </div>
        <UploadZone onSuccess={() => setRefreshKey((k) => k + 1)} />
      </section>

      {/* Gallery */}
      <section className="px-4 py-12 bg-white/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-playfair text-3xl text-dark">Galería de Momentos</h2>
            <Divider />
          </div>
          <Gallery refreshKey={refreshKey} />
        </div>
      </section>
    </>
  );
}
