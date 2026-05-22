import { Suspense } from "react";
import PageContent from "@/components/PageContent";
import QRCodeDisplay from "@/components/QRCodeDisplay";

// ─── Divider ornamental (estrella giratoria) ──────────────────────────────────

function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-4 py-2">
      <div className="h-px flex-1 max-w-xs bg-gradient-to-r from-transparent to-gold/30" />
      <svg
        className="w-5 h-5 text-gold/50 shrink-0 animate-slow-spin"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 2l1.8 5.4H18l-4.9 3.6 1.8 5.4L10 13l-4.9 3.4 1.8-5.4L2 7.4h6.2z" />
      </svg>
      <div className="h-px flex-1 max-w-xs bg-gradient-to-l from-transparent to-gold/30" />
    </div>
  );
}

// ─── Pétalo decorativo — puramente CSS, sin JS ────────────────────────────────

interface PetalProps {
  left: string;
  width: number;
  height: number;
  rotate: number;
  duration: number;
  delay: number;
}

function Petal({ left, width, height, rotate, duration, delay }: PetalProps) {
  return (
    <div
      className="petal"
      aria-hidden="true"
      style={{
        left,
        bottom: "6%",
        width:  `${width}px`,
        height: `${height}px`,
        transform: `rotate(${rotate}deg)`,
        animationDuration: `${duration}s`,
        animationDelay:    `${delay}s`,
      }}
    />
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function HomePage() {
  const coupleNames = process.env.COUPLE_NAMES ?? "Los Novios";
  const weddingDate = process.env.WEDDING_DATE ?? "";
  const appUrl      = process.env.APP_URL       ?? "http://localhost:3000";

  return (
    <main className="min-h-screen">

      {/* ── Hero ──────────────────────────────────────────────────────────────── */}
      <section className="relative py-24 px-4 text-center overflow-hidden">

        {/* Anillos concéntricos — pulsan con retardos alternos */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden="true">
          <div
            className="w-[340px] h-[340px] rounded-full border border-rose/20 absolute animate-ring-pulse"
            style={{ animationDelay: "1s", animationDuration: "5s" }}
          />
          <div
            className="w-[530px] h-[530px] rounded-full border border-gold/12 absolute animate-ring-pulse"
          />
          <div
            className="w-[750px] h-[750px] rounded-full border border-gold/7 absolute animate-ring-pulse-slow"
            style={{ animationDelay: "2.5s" }}
          />
        </div>

        {/* Pétalos flotantes — posiciones y tiempos distintos para no sincronizarse */}
        <Petal left="7%"  width={10} height={18} rotate={30}  duration={13} delay={0}   />
        <Petal left="20%" width={8}  height={14} rotate={-20} duration={16} delay={3.5} />
        <Petal left="50%" width={13} height={21} rotate={55}  duration={12} delay={1.5} />
        <Petal left="73%" width={9}  height={16} rotate={-40} duration={15} delay={5}   />
        <Petal left="89%" width={11} height={19} rotate={25}  duration={14} delay={2.5} />
        <Petal left="36%" width={7}  height={13} rotate={70}  duration={18} delay={8}   />

        {/* Contenido — cada elemento entra escalonado con fade-in-up */}
        <div className="relative z-10 max-w-3xl mx-auto space-y-5">

          <p
            className="font-lato text-xs tracking-[0.35em] text-gold uppercase animate-fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            ♡ &nbsp;Álbum de Boda&nbsp; ♡
          </p>

          <div className="animate-fade-in-up" style={{ animationDelay: "0.25s" }}>
            <OrnamentalDivider />
          </div>

          <h1
            className="font-playfair text-5xl sm:text-7xl text-dark leading-tight animate-fade-in-up"
            style={{ animationDelay: "0.4s" }}
          >
            {coupleNames}
          </h1>

          {weddingDate && (
            <p
              className="font-lato text-warm-brown tracking-widest text-sm animate-fade-in-up"
              style={{ animationDelay: "0.55s" }}
            >
              {weddingDate}
            </p>
          )}

          <div className="animate-fade-in-up" style={{ animationDelay: "0.65s" }}>
            <OrnamentalDivider />
          </div>

          <p
            className="font-lato text-warm-brown/70 text-base max-w-md mx-auto leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "0.8s" }}
          >
            Cada foto que compartas formará parte de nuestro recuerdo más especial.
          </p>

        </div>
      </section>

      {/* ── Upload + Gallery ────────────────────────────────────────────────── */}
      <PageContent />

      {/* ── QR Code ─────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 text-center bg-white/30 border-t border-gold/10">
        <h2 className="font-playfair text-3xl text-dark mb-2">
          Comparte el Álbum
        </h2>
        <p className="font-lato text-warm-brown/60 text-sm mb-10">
          Muéstrale este código a los invitados para que puedan subir sus fotos
        </p>
        <Suspense fallback={
          <div className="flex items-center justify-center h-44">
            <span className="inline-block w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        }>
          <QRCodeDisplay url={appUrl} />
        </Suspense>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-8 text-center border-t border-gold/10">
        <p className="font-playfair text-warm-brown/40 text-sm italic">
          {coupleNames} {weddingDate && `· ${weddingDate}`}
        </p>
      </footer>

    </main>
  );
}
