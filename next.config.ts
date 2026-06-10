import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // La app nunca debe mostrarse embebida en otro sitio (clickjacking)
          { key: "X-Frame-Options",        value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          // La app no usa cámara/micrófono/geolocalización vía APIs del browser
          { key: "Permissions-Policy",     value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
