// Preparar un fichero para la hoja de compartir de iOS (lib/nativo/puente.ts →
// `compartirFichero`). Puro: se prueba sin navegador (ficheros.test.ts).
//
// En la app, compartir es escribir el fichero en la caché con Filesystem y
// pasarle su ruta a Share. iOS decide qué ofrecer (Calendario para un .ics,
// Archivos o Imprimir para un PDF) por la EXTENSIÓN, no por el tipo MIME: un
// `.ics` sin extensión llega como «documento» y Calendario no aparece.

const EXTENSION_POR_TIPO: Record<string, string> = {
  'text/calendar': 'ics',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/plain': 'txt',
};

/**
 * Un nombre de fichero que se puede escribir tal cual: sin carpetas (`../`),
 * sin caracteres de control ni los que iOS no admite, y con la extensión que
 * pide su tipo si no la trae.
 */
export function nombreDeFicheroSeguro(nombre: string, tipo = ''): string {
  let limpio = nombre
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120);
  if (!limpio) limpio = 'archivo';
  const ext = EXTENSION_POR_TIPO[tipo.split(';')[0].trim().toLowerCase()];
  if (ext && !limpio.toLowerCase().endsWith(`.${ext}`)) limpio = `${limpio}.${ext}`;
  return limpio;
}

/** Bytes en base64, en trozos: `String.fromCharCode(...bytes)` de golpe revienta la pila con un PDF de unos cientos de KB. */
export function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}
