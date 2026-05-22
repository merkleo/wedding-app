import QRCode from "qrcode";

export default async function QRCodeDisplay({ url }: { url: string }) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    width: 180,
    margin: 2,
    color: { dark: "#2C2C2C", light: "#FDF8F0" },
    errorCorrectionLevel: "M",
  });

  return (
    <div className="flex flex-col items-center gap-4">

      {/* Marco ornamental — ancho y alto fijos para que las esquinas
          envuelvan exactamente el QR sin depender del flujo flex */}
      <div
        className="relative mx-auto flex items-center justify-center"
        style={{ width: 205, height: 205 }}
      >
        {/* Esquinas decorativas */}
        <div className="absolute top-0 left-0   w-5 h-5 border-t-2 border-l-2 border-gold/60" />
        <div className="absolute top-0 right-0  w-5 h-5 border-t-2 border-r-2 border-gold/60" />
        <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-gold/60" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-gold/60" />

        {/* QR centrado dentro del marco */}
        <div
          className="p-3 bg-cream rounded-2xl shadow-inner border border-gold/20"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ width: 180, height: 180 }}
        />
      </div>

      <p className="text-warm-brown/50 text-sm font-lato">
        Escanea para abrir el álbum desde tu celular
      </p>
      <a href={url} className="text-gold text-xs font-lato hover:underline break-all">
        {url}
      </a>

    </div>
  );
}
