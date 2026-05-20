import { Suspense } from "react";
import PageContent from "@/components/PageContent";
import QRCodeDisplay from "@/components/QRCodeDisplay";

function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-4 py-2">
      <div className="h-px flex-1 max-w-xs bg-gradient-to-r from-transparent to-gold/30" />
      <svg className="w-5 h-5 text-gold/50 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2l1.8 5.4H18l-4.9 3.6 1.8 5.4L10 13l-4.9 3.4 1.8-5.4L2 7.4h6.2z" />
      </svg>
      <div className="h-px flex-1 max-w-xs bg-gradient-to-l from-transparent to-gold/30" />
    </div>
  );
}

export default function HomePage() {
  const coupleNames  = process.env.COUPLE_NAMES  ?? "Los Novios";
  const weddingDate  = process.env.WEDDING_DATE  ?? "";
  const appUrl       = process.env.APP_URL        ?? "http://localhost:3000";

  return (
    <main className="min-h-screen">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative py-24 px-4 text-center overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[500px] h-[500px] rounded-full border border-gold/8 absolute" />
          <div className="w-[700px] h-[700px] rounded-full border border-gold/5 absolute" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto space-y-5">
          <p className="font-lato text-xs tracking-[0.35em] text-gold uppercase">
            ♡ &nbsp;Álbum de Boda&nbsp; ♡
          </p>

          <OrnamentalDivider />

          <h1 className="font-playfair text-5xl sm:text-7xl text-dark leading-tight">
            {coupleNames}
          </h1>

          {weddingDate && (
            <p className="font-lato text-warm-brown tracking-widest text-sm">
              {weddingDate}
            </p>
          )}

          <OrnamentalDivider />

          <p className="font-lato text-warm-brown/70 text-base max-w-md mx-auto leading-relaxed">
            Cada foto que compartas formará parte de nuestro recuerdo más especial.
          </p>
        </div>
      </section>

      {/* ── Upload + Gallery ─────────────────────────────────────── */}
      <PageContent />

      {/* ── QR Code ──────────────────────────────────────────────── */}
      <section className="py-16 px-4 text-center bg-white/30 border-t border-gold/10">
        <h2 className="font-playfair text-3xl text-dark mb-2">
          Comparte el Álbum
        </h2>
        <p className="font-lato text-warm-brown/60 text-sm mb-10">
          Muéstrale este código a los invitados para que puedan subir sus fotos
        </p>
        <Suspense fallback={
          <div className="flex items-center justify-center h-44">
            <span className="inline-block w-8 h-8 border-2 border-gold/30
                             border-t-gold rounded-full animate-spin" />
          </div>
        }>
          <QRCodeDisplay url={appUrl} />
        </Suspense>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="py-8 text-center border-t border-gold/10">
        <p className="font-playfair text-warm-brown/40 text-sm italic">
          {coupleNames} {weddingDate && `· ${weddingDate}`}
        </p>
      </footer>
    </main>
  );
}
