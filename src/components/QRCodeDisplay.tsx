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
    <div className="flex flex-col items-center gap-5">
      {/* Marco ornamental */}
      <div className="relative p-6 inline-block">
        {/* Esquinas decorativas */}
        <div className="absolute top-0 left-0  w-5 h-5 border-t-2 border-l-2 border-gold/60 rounded-tl" />
        <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-gold/60 rounded-tr" />
        <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-gold/60 rounded-bl" />
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-gold/60 rounded-br" />

        {/* QR */}
        <div
          className="p-3 bg-cream rounded-xl shadow-inner border border-gold/15"
          dangerouslySetInnerHTML={{ __html: svg }}
          style={{ width: 188, height: 188 }}
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
