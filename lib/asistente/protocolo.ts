// Lo que la ruta POST /api/asistente manda al navegador: una línea JSON por
// evento (NDJSON). NDJSON y no SSE porque el panel ya llama con `fetch` y su
// cabecera de sesión (`authHeader()`), y `EventSource` no manda cabeceras.
// Puro: lo usan la ruta y el navegador, y se prueba con `node --test`.

import type { BloqueAsistente, NombreHerramienta } from './tipos.ts';

export type CodigoAviso = 'CIFRA_SIN_RESPALDO' | 'LIMITE_HERRAMIENTAS' | 'DEMASIADO_AMPLIA' | 'RECHAZADA';
export type MotivoFin = 'OK' | 'ACLARACION' | 'DEMASIADO_AMPLIA';

export type EventoAsistente =
  | { t: 'inicio'; conversacionId: string; disponibles: number }
  | { t: 'herramienta'; id: string; nombre: NombreHerramienta; etiqueta: string }
  | { t: 'bloque'; id: string; bloque: BloqueAsistente }
  // Los nombres SOLO van al navegador, nunca a Anthropic ni a la base de datos.
  | { t: 'referencias'; refs: Record<string, { nombre: string; href: string | null }> }
  | { t: 'texto'; delta: string }
  | { t: 'aviso'; codigo: CodigoAviso }
  | { t: 'fin'; unidades: number; disponibles: number; motivo: MotivoFin }
  | { t: 'error'; codigo: 'IA_NO_DISPONIBLE' | 'INTERNO'; mensaje: string };

export function codificarEvento(e: EventoAsistente): string {
  return `${JSON.stringify(e)}\n`;
}

/**
 * Lector incremental: se le dan los trozos tal como llegan (una línea puede
 * venir partida entre dos) y devuelve los eventos completos. Una línea que no
 * es JSON se ignora: el protocolo no puede tumbar el panel.
 */
export function lectorNdjson(): { empujar: (trozo: string) => EventoAsistente[]; terminar: () => EventoAsistente[] } {
  let pendiente = '';
  const parsear = (linea: string): EventoAsistente[] => {
    const l = linea.trim();
    if (!l) return [];
    try {
      const e = JSON.parse(l) as EventoAsistente;
      return e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string' ? [e] : [];
    } catch {
      return [];
    }
  };
  return {
    empujar(trozo) {
      pendiente += trozo;
      const lineas = pendiente.split('\n');
      pendiente = lineas.pop() ?? '';
      return lineas.flatMap(parsear);
    },
    terminar() {
      const ultima = pendiente;
      pendiente = '';
      return parsear(ultima);
    },
  };
}
