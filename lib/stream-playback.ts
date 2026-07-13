// Reproducción de Cloudflare Stream — PURO y apto para el navegador: solo usa el
// UID del vídeo (público) y una variable NEXT_PUBLIC opcional, nunca el token de
// API. El código de cliente (`customer-<code>`) es el subdominio propio de la
// cuenta; si no se define, se usa el dominio genérico videodelivery.net, que no
// lo requiere — así basta con el token de servidor para que todo funcione.

const CODE = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE;

/** URL del iframe embebible del reproductor de Stream (gestiona procesado, adaptativo, controles). */
export function urlIframeStream(uid: string): string {
  return CODE
    ? `https://customer-${CODE}.cloudflarestream.com/${uid}/iframe`
    : `https://iframe.videodelivery.net/${uid}`;
}

/** URL del thumbnail generado automáticamente por Stream. */
export function urlThumbnailStream(uid: string): string {
  return CODE
    ? `https://customer-${CODE}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`
    : `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`;
}
