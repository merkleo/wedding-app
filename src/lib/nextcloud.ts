import { parseStringPromise } from "xml2js";
import type { Photo } from "./types";

export type { Photo };

const NC_URL      = () => process.env.NEXTCLOUD_URL!.replace(/\/$/, "");
const NC_USER     = () => process.env.NEXTCLOUD_USERNAME!;
const NC_TOKEN    = () => process.env.NEXTCLOUD_APP_TOKEN!;
const NC_FOLDER   = () => process.env.NEXTCLOUD_FOLDER || "fotos-boda";

// ─── Caché de listado ─────────────────────────────────────────────────────────
//
// listPhotos() hace 1 PROPFIND + 1 GET por cada foto con dedicatoria (N+1).
// Con muchos invitados refrescando la galería a la vez, eso multiplica la
// carga sobre NextCloud. El caché en memoria absorbe esas ráfagas; el upload
// lo invalida para que las fotos nuevas aparezcan de inmediato.

const CACHE_TTL_MS = 30_000;

type PhotosCache = { data: Photo[]; expires: number };

// Singleton sobre globalThis: en producción Next puede incluir una copia de
// este módulo en el bundle de cada ruta. Si el caché fuera una variable de
// módulo, invalidarlo desde /api/upload no afectaría al de /api/photos.
const g = globalThis as typeof globalThis & { __photosCache?: PhotosCache | null };

export function invalidatePhotosCache(): void {
  g.__photosCache = null;
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${NC_USER()}:${NC_TOKEN()}`).toString("base64");
}

function davUrl(path = ""): string {
  const encoded = encodeURIComponent(NC_FOLDER());
  const suffix  = path ? "/" + encodeURIComponent(path) : "";
  return `${NC_URL()}/remote.php/dav/files/${NC_USER()}/${encoded}${suffix}`;
}

export async function ensureFolder(): Promise<void> {
  const res = await fetch(davUrl(), {
    method: "MKCOL",
    headers: { Authorization: authHeader() },
  });
  // 201 = created, 405 = already exists — both fine
  if (![201, 405].includes(res.status)) {
    const check = await fetch(davUrl(), {
      method: "PROPFIND",
      headers: { Authorization: authHeader(), Depth: "0" },
    });
    if (!check.ok) throw new Error(`No se puede acceder a la carpeta: ${check.status}`);
  }
}

export async function uploadFile(filename: string, data: Buffer, contentType: string): Promise<void> {
  const res = await fetch(davUrl(filename), {
    method: "PUT",
    headers: { Authorization: authHeader(), "Content-Type": contentType },
    body: new Uint8Array(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error al subir ${filename} (${res.status}): ${text}`);
  }
}

export async function uploadMeta(photoFilename: string, message: string): Promise<void> {
  const body = JSON.stringify({ message, uploadedAt: new Date().toISOString() });
  await uploadFile(`${photoFilename}.meta.json`, Buffer.from(body, "utf-8"), "application/json");
}

export async function listPhotos(): Promise<Photo[]> {
  if (g.__photosCache && Date.now() < g.__photosCache.expires) {
    return g.__photosCache.data;
  }

  const res = await fetch(davUrl(), {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(),
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontenttype/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`,
  });

  if (!res.ok) throw new Error(`PROPFIND falló: ${res.status}`);

  const xml    = await res.text();
  const parsed = await parseStringPromise(xml);

  const raw       = parsed["d:multistatus"]?.["d:response"] ?? [];
  const responses = Array.isArray(raw) ? raw : [raw];

  const imageRe   = /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i;
  const imageFiles: Photo[]  = [];
  const metaSet: Set<string> = new Set();
  const thumbSet: Set<string>= new Set();

  for (const r of responses) {
    const href        = (r["d:href"]?.[0] ?? "") as string;
    const rawName     = href.split("/").pop() ?? "";
    const filename    = decodeURIComponent(rawName);
    const propstats   = r["d:propstat"] ?? [];
    const okPs        = propstats.find((ps: Record<string, string[]>) =>
      (ps["d:status"]?.[0] ?? "").includes("200")
    );
    const prop        = okPs?.["d:prop"]?.[0] ?? {};
    const contentType = (prop["d:getcontenttype"]?.[0] ?? "") as string;
    const lastMod     = (prop["d:getlastmodified"]?.[0] ?? "") as string;
    const size        = parseInt(prop["d:getcontentlength"]?.[0] ?? "0");

    // Sidecars: skip but index them
    if (filename.endsWith(".meta.json"))  { metaSet.add(filename);  continue; }
    if (filename.endsWith(".thumb.webp")) { thumbSet.add(filename); continue; }
    if (!imageRe.test(filename)) continue;

    imageFiles.push({
      filename,
      uploadedAt: lastMod ? new Date(lastMod).toISOString() : new Date().toISOString(),
      contentType,
      size,
    });
  }

  // Sort newest first
  imageFiles.sort((a, b) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );

  // Enrich each photo with thumbnail + optional meta
  const enriched = await Promise.all(
    imageFiles.map(async (photo) => {
      // Thumbnail companion: {ts}-{rnd}.thumb.webp
      const thumbName    = photo.filename.replace(/\.webp$/i, ".thumb.webp");
      const thumbFilename= thumbSet.has(thumbName) ? thumbName : undefined;

      // Meta sidecar
      const metaName = `${photo.filename}.meta.json`;
      if (!metaSet.has(metaName)) return { ...photo, thumbFilename };
      try {
        const metaRes = await fetch(davUrl(metaName), {
          headers: { Authorization: authHeader() },
        });
        if (metaRes.ok) {
          const meta = await metaRes.json() as { message?: string; uploadedAt?: string };
          return {
            ...photo,
            thumbFilename,
            message:    meta.message,
            uploadedAt: meta.uploadedAt ?? photo.uploadedAt,
          };
        }
      } catch { /* no meta */ }
      return { ...photo, thumbFilename };
    })
  );

  g.__photosCache = { data: enriched, expires: Date.now() + CACHE_TTL_MS };
  return enriched;
}

export async function streamFile(filename: string): Promise<{
  body: ReadableStream;
  contentType: string;
  contentLength: string | null;
}> {
  const res = await fetch(davUrl(filename), {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`Archivo no encontrado: ${filename} (${res.status})`);
  return {
    body: res.body!,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    contentLength: res.headers.get("content-length"),
  };
}
