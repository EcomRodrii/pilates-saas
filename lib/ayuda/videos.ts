// ─────────────────────────────────────────────────────────────────────────────
// Los vídeos de las guías (Tentare Academy). Puro y sin `@/`: se prueba con `node --test`.
//
// Un vídeo cuelga de UNA guía del registro (`lib/ayuda/registro.ts`) por su clave «categoria/slug». Vive en la base de datos
// (`ayuda_videos`, global y solo servidor) y no en el código para poder publicarlo sin desplegar; el TEXTO de la guía sigue en
// código, con sus pruebas. Un vídeo sin `publicado` no se enseña en ninguna parte: «pendiente de producción» no es contenido.
//
// Proveedor: Vimeo (decisión del fundador, 14-nov-2026). Se incrusta con una FACHADA (components/ayuda/VideoFachada.tsx): hasta
// que la persona pulsa reproducir no se pide nada a Vimeo, y el reproductor lleva `dnt=1` (sin seguimiento). Es lo que permite
// decir que la web no guarda nada en el dispositivo de quien solo lee.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelVideo = 'principiante' | 'intermedio' | 'avanzado';
export const NIVELES: Readonly<Record<NivelVideo, string>> = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const NIVELES_VALIDOS = Object.keys(NIVELES) as NivelVideo[];

export interface VideoAyuda {
  /** «categoria/slug» de la guía. */
  articulo: string;
  videoId: string;
  /** Solo los vídeos «no listados» de Vimeo lo llevan (el `h=` de su reproductor). */
  hashPrivado: string | null;
  titulo: string;
  duracionSeg: number;
  nivel: NivelVideo;
  resultado: string | null;
  destacado: boolean;
  publicado: boolean;
}

/** La fila tal como está en `ayuda_videos`. */
export interface FilaVideo {
  articulo: string; video_id: string; hash_privado: string | null; titulo: string; duracion_seg: number;
  nivel: string; resultado: string | null; destacado: boolean; publicado: boolean;
}

export function videoDeFila(f: FilaVideo): VideoAyuda | null {
  if (!NIVELES_VALIDOS.includes(f.nivel as NivelVideo)) return null;
  return {
    articulo: f.articulo, videoId: f.video_id, hashPrivado: f.hash_privado, titulo: f.titulo, duracionSeg: f.duracion_seg,
    nivel: f.nivel as NivelVideo, resultado: f.resultado, destacado: f.destacado, publicado: f.publicado,
  };
}

/**
 * Lo que se pega en el formulario del administrador puede ser el id a secas, la URL de la página
 * (`https://vimeo.com/123456789/abcdef1234`, con el hash de un vídeo no listado detrás) o la del reproductor
 * (`https://player.vimeo.com/video/123456789?h=abcdef1234`). Se aceptan las tres.
 */
export function extraerVimeo(texto: string): { videoId: string; hash: string | null } | null {
  const t = texto.trim();
  if (/^\d{5,12}$/.test(t)) return { videoId: t, hash: null };
  let url: URL;
  try { url = new URL(t); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (host !== 'vimeo.com' && host !== 'www.vimeo.com' && host !== 'player.vimeo.com') return null;
  const partes = url.pathname.split('/').filter(Boolean);
  const desdeReproductor = host === 'player.vimeo.com' ? partes[1] : partes[0];
  if (!desdeReproductor || !/^\d{5,12}$/.test(desdeReproductor)) return null;
  const hash = url.searchParams.get('h') ?? (host === 'player.vimeo.com' ? null : partes[1] ?? null);
  return { videoId: desdeReproductor, hash: hash && /^[a-f0-9]{6,40}$/.test(hash) ? hash : null };
}

/** La URL del reproductor, con seguimiento desactivado. Solo se usa tras pulsar reproducir. */
export function urlReproductor(v: Pick<VideoAyuda, 'videoId' | 'hashPrivado'>): string {
  const h = v.hashPrivado ? `h=${v.hashPrivado}&` : '';
  return `https://player.vimeo.com/video/${v.videoId}?${h}dnt=1&autoplay=1&title=0&byline=0&portrait=0`;
}

/** Lo que escribe quien graba: «4:05» o «245» (segundos). `null` si no se entiende. */
export function parsearDuracion(texto: string): number | null {
  const t = texto.trim();
  const mmss = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  return /^\d{1,4}$/.test(t) ? Number(t) : null;
}

/** 245 s → «4:05». */
export function formatearDuracion(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type ResultadoValidacion = { ok: true; fila: FilaVideo } | { ok: false; error: string };

/** Lo que manda el administrador (`articulos` = claves válidas del registro, para no colgar un vídeo de una guía que no existe). */
export function validarVideo(body: unknown, articulosValidos: ReadonlySet<string>): ResultadoValidacion {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const articulo = typeof b.articulo === 'string' ? b.articulo.trim() : '';
  if (!articulosValidos.has(articulo)) return { ok: false, error: 'Esa guía no existe en el Centro de ayuda.' };
  const vimeo = typeof b.vimeo === 'string' ? extraerVimeo(b.vimeo) : null;
  if (!vimeo) return { ok: false, error: 'Pega el enlace de Vimeo (o su número). Si el vídeo es «no listado», el enlace completo lleva el código final.' };
  const titulo = typeof b.titulo === 'string' ? b.titulo.trim() : '';
  if (titulo.length < 3 || titulo.length > 120) return { ok: false, error: 'El título tiene que tener entre 3 y 120 caracteres.' };
  const duracion = typeof b.duracionSeg === 'number' ? b.duracionSeg : Number(b.duracionSeg);
  if (!Number.isInteger(duracion) || duracion < 5 || duracion > 3600) return { ok: false, error: 'La duración va en segundos, entre 5 y 3600.' };
  const nivel = typeof b.nivel === 'string' ? b.nivel : '';
  if (!NIVELES_VALIDOS.includes(nivel as NivelVideo)) return { ok: false, error: 'Elige un nivel.' };
  const resultadoBruto = typeof b.resultado === 'string' ? b.resultado.trim() : '';
  if (resultadoBruto && (resultadoBruto.length < 5 || resultadoBruto.length > 200)) return { ok: false, error: '«Lo que vas a conseguir» va entre 5 y 200 caracteres, o vacío.' };
  return {
    ok: true,
    fila: {
      articulo, video_id: vimeo.videoId, hash_privado: vimeo.hash, titulo, duracion_seg: duracion, nivel,
      resultado: resultadoBruto || null, destacado: b.destacado === true, publicado: b.publicado === true,
    },
  };
}
