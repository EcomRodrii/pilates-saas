// La demo de Configuración: un vídeo que recorre TODAS las secciones, una por
// una, configurando cada ajuste con un estudio de ejemplo y explicando qué hace
// y por qué. Está pensado para enseñar a una propietaria nueva.
//
// ⚠️ El binario NO vive en el repo (pesa decenas de MB y el repo es público): la
// dirección va en `VIDEO_DEMO.url` (bucket público de lectura `demo-configuracion`,
// fichero `demo-configuracion-v2.mp4`). Si fuera `null`, la sección enseña el índice
// de capítulos y lo dice, en vez de un reproductor vacío.
// Para cambiar el vídeo se sube con otro nombre (`-v2`): la URL pública se cachea.
//
// ⚠️ Los capítulos y sus minutos NO se escriben a mano: los genera
// `npm run demo:montar` (demo/montar.mjs) al unir el vídeo, a partir de lo que
// de verdad se grabó, en `demo-capitulos.ts`. Un minuto escrito a mano deja de
// ser cierto en cuanto se regraba una sola pantalla.
//
// El estudio del vídeo es ficticio (datos @example.com): ningún estudio ni
// alumna reales salen en él.
//
// Pura y sin React: la ejecuta `node --test` directamente.

import { CAPITULOS_DEMO, DURACION_DEMO_SEG, type CapituloDemo } from './demo-capitulos.ts';
import type { SeccionId } from './secciones.ts';

export { CAPITULOS_DEMO, DURACION_DEMO_SEG };
export type { CapituloDemo };

export interface VideoDemo {
  /** Dirección del vídeo (mp4), o `null` si todavía no está publicado. */
  readonly url: string | null;
  /** Imagen que se ve antes de darle al play, o `null`. */
  readonly portada: string | null;
}

export const VIDEO_DEMO: VideoDemo = {
  url: 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/demo-configuracion/demo-configuracion-v2.mp4',
  portada: '/demo/portada-demo-configuracion.jpg',
};

/** `83` → `1:23`; `3725` → `1:02:05`. */
export function formatoMinuto(seg: number): string {
  const total = Math.max(0, Math.round(seg));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

/** Los capítulos que este rol puede abrir de verdad (la gerencia no ve «Cobros»). */
export function capitulosVisibles(visibles: readonly SeccionId[]): CapituloDemo[] {
  return CAPITULOS_DEMO.filter(c => visibles.includes(c.seccion));
}
