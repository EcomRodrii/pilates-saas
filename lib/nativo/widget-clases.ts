// Las próximas clases para el widget de iOS «Mi próxima clase» (docs/APP-IOS.md).
//
// Puro y sin `@/`: lo prueba `node --test` (widget-clases.test.ts). La app las
// guarda en el grupo de apps con `ProximaClasePlugin` y el widget las lee sin
// red (`ios/App/Compartido/ProximasClases.swift` es la otra mitad de este
// contrato: si cambia la forma, sube `VERSION_WIDGET` y cambia allí `version`).
//
// Lo que sale de aquí va a la pantalla de INICIO del iPhone (y a la de bloqueo),
// visible sin desbloquear la app: por eso es lo MÍNIMO para dibujar el widget —
// nombre de la clase, hora, estudio y, si hay, instructora y sala—. Nunca ids de
// alumna, correo, pagos ni bonos.

import type { Clase, Instructora, Reserva } from '../student/tipos.ts';

/** Versión del contrato con el widget. Sincronizada con `ProximasClasesAlmacen.version` (Swift). */
export const VERSION_WIDGET = 1;
/** El widget mediano enseña dos; con una de reserva por si una acaba. */
export const MAX_CLASES_WIDGET = 3;

const MAX_TEXTO = 80;

export interface ClaseWidget {
  id: string;
  titulo: string;
  /** ISO 8601 en UTC, sin fracción de segundo. */
  inicio: string;
  fin: string;
  estudio: string;
  instructora?: string;
  sala?: string;
}

/** Recorta y limpia un texto que va a una pantalla del sistema. */
function texto(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO);
}

/** ISO sin milisegundos (Swift lo lee con o sin ellos; así es lo más corto y estable). */
function iso(v: string): string | null {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
}

/**
 * Las reservas CONFIRMADAS que aún no han terminado, de la más próxima a la
 * más lejana. La que se está dando ahora se queda (el widget la enseña hasta
 * que acaba). Lo cancelado, lo asistido y la lista de espera no cuentan.
 */
export function clasesParaElWidget(e: {
  reservas: readonly Pick<Reserva, 'claseId' | 'estado'>[];
  clases: readonly Pick<Clase, 'id' | 'nombre' | 'inicio' | 'fin' | 'sala' | 'instructoraId'>[];
  instructoras: readonly Pick<Instructora, 'id' | 'nombre'>[];
  estudio: string;
  ahoraMs: number;
  max?: number;
}): ClaseWidget[] {
  const nombreEstudio = texto(e.estudio);
  const vistas = new Set<string>();
  const salida: (ClaseWidget & { _ini: number })[] = [];

  for (const r of e.reservas) {
    if (r.estado !== 'confirmada' || vistas.has(r.claseId)) continue;
    const c = e.clases.find((x) => x.id === r.claseId);
    if (!c) continue;
    const ini = iso(c.inicio);
    const fin = iso(c.fin);
    if (!ini || !fin) continue;
    const iniMs = new Date(ini).getTime();
    const finMs = new Date(fin).getTime();
    if (finMs <= e.ahoraMs || finMs <= iniMs) continue;
    vistas.add(r.claseId);
    const instructora = texto(e.instructoras.find((i) => i.id === c.instructoraId)?.nombre);
    const sala = texto(c.sala);
    salida.push({
      id: c.id,
      titulo: texto(c.nombre) || 'Clase',
      inicio: ini,
      fin,
      estudio: nombreEstudio,
      ...(instructora ? { instructora } : {}),
      ...(sala ? { sala } : {}),
      _ini: iniMs,
    });
  }

  return salida
    .sort((a, b) => a._ini - b._ini)
    .slice(0, e.max ?? MAX_CLASES_WIDGET)
    .map(({ _ini, ...clase }) => clase);
}

/** Lo que recibe `ProximaClasePlugin.guardar({ json })`. */
export function jsonParaElWidget(clases: readonly ClaseWidget[], ahoraMs: number): string {
  return JSON.stringify({
    version: VERSION_WIDGET,
    actualizadoEn: new Date(ahoraMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    clases,
  });
}
