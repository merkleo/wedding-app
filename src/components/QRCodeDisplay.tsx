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
      <div
        className="p-4 bg-cream rounded-2xl shadow-inner border border-gold/20"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{ width: 180, height: 180 }}
      />
      <p className="text-warm-brown/50 text-sm font-lato">
        Escanea para abrir el álbum desde tu celular
      </p>
      <a href={url} className="text-gold text-xs font-lato hover:underline break-all">
        {url}
      </a>
    </div>
  );
}
