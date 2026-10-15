'use client';

import { authHeader } from '@/lib/api-client';
import { MAX_BYTES_IMAGEN, type FilaRevisable } from '@/lib/horario-imagen/mapeo';

// El lado del navegador de P2.1: reducir la captura antes de enviarla (≤ 1568
// px por lado, que es lo que el modelo aprovecha; pesa mucho menos) y pedir la
// lectura. Nada se guarda aquí: ni la imagen ni el texto pasan por storage.

export interface LecturaRecibida {
  resultado: 'HORARIO' | 'NO_ES_HORARIO' | 'ILEGIBLE';
  filas: FilaRevisable[];
  descartadas: number;
  avisos: string[];
  /** El primer lunes que se crea ('YYYY-MM-DD'); lo pone el servidor. */
  desde: string;
}

const LADO_MAXIMO = 1568;

/**
 * La captura, reducida y en JPEG. Lanza si el navegador no sabe abrirla (una
 * foto HEIC del iPhone en un navegador que no es Safari): la pantalla pide una
 * captura en PNG o JPG.
 */
export async function reducirImagen(archivo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
    const ancho = Math.max(1, Math.round(bmp.width * escala));
    const alto = Math.max(1, Math.round(bmp.height * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('sin canvas');
    // JPEG no tiene transparencia: sin fondo, lo transparente saldría negro.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bmp, 0, 0, ancho, alto);
    const blob = await new Promise<Blob>((ok, mal) =>
      lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('toBlob'))), 'image/jpeg', 0.85));
    if (blob.size > MAX_BYTES_IMAGEN) throw new Error('demasiado grande');
    return blob;
  } finally {
    bmp.close();
  }
}

/** Pide la lectura. Nunca lanza: un fallo vuelve con su mensaje para enseñarlo en rojo. */
export async function pedirLecturaHorario(
  entrada: { imagen: Blob } | { texto: string },
): Promise<{ ok: true; lectura: LecturaRecibida } | { ok: false; error: string }> {
  const datos = new FormData();
  if ('imagen' in entrada) datos.append('imagen', entrada.imagen, 'horario.jpg');
  else datos.append('texto', entrada.texto);
  try {
    const res = await fetch('/api/horario/leer', { method: 'POST', headers: await authHeader(), body: datos });
    const cuerpo = (await res.json().catch(() => null)) as (LecturaRecibida & { error?: string }) | null;
    // Apagado mientras la pantalla estaba abierta (el interruptor se recuerda un rato).
    if (res.status === 404) return { ok: false, error: 'Leer el horario desde una captura no está disponible ahora. Súbelo en Excel.' };
    if (!res.ok || !cuerpo || !Array.isArray(cuerpo.filas) || !/^\d{4}-\d{2}-\d{2}$/.test(String(cuerpo.desde))) {
      // Solo un mensaje del servidor con forma de frase; nada de volcar lo que llegue.
      const msg = typeof cuerpo?.error === 'string' && cuerpo.error.length <= 200 ? cuerpo.error : null;
      return { ok: false, error: msg || 'No hemos podido leer el horario. Inténtalo de nuevo en un rato.' };
    }
    return { ok: true, lectura: cuerpo };
  } catch {
    return { ok: false, error: 'No se ha podido conectar. Revisa la conexión e inténtalo de nuevo.' };
  }
}
