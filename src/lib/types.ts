// Tipo compartido entre el backend (nextcloud.ts) y los componentes cliente.
// Única fuente de verdad: evita las 4 copias divergentes que existían en
// PageContent, AnimatedMosaic, GalleryModal y nextcloud.ts.

export interface Photo {
  filename: string;
  /** {ts}-{rnd}.thumb.webp — existe si la foto fue subida con thumbnail */
  thumbFilename?: string;
  uploadedAt: string;
  message?: string;
  contentType: string;
  size: number;
}
