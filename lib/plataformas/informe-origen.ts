// Asistencias por plataforma en un periodo: lo que el estudio necesita para
// cuadrar lo que le paga ClassPass / Urban Sports Club / Wellhub.
//
// Las plataformas pagan por visita, así que lo que cuenta es quién vino
// (ASISTIDA), quién no se presentó y quién canceló. Puro y sin `@/`: lo usa la
// pantalla de Informes y se prueba con `node --test`.
import { esPlataforma, NOMBRE_PLATAFORMA, PLATAFORMAS, type OrigenReserva, type Plataforma } from './catalogo.ts';

export interface ReservaInforme {
  id: string;
  sesionId: string;
  estado: string;
  origen?: OrigenReserva | null;
  nombreExterno?: string | null;
}
export interface SesionInforme { id: string; inicio: string; cancelada?: boolean; tipoClaseId?: string | null }

export interface ResumenPlataforma {
  plataforma: Plataforma;
  vinieron: number;
  noVinieron: number;
  pendientes: number;
  canceladas: number;
}

export interface FilaCsvOrigen {
  fecha: string;
  clase: string;
  persona: string;
  plataforma: string;
  estado: string;
}

const ESTADO_LEGIBLE: Record<string, string> = {
  ASISTIDA: 'Vino',
  NO_ASISTIO: 'No vino',
  CONFIRMADA: 'Reservada',
  CANCELADA: 'Cancelada',
};

function enPeriodo(s: SesionInforme | undefined, desde: Date, hasta: Date): s is SesionInforme {
  if (!s || s.cancelada) return false;
  const t = new Date(s.inicio).getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

/** Una fila por plataforma con reservas en el periodo, en el orden del catálogo. */
export function resumenPorPlataforma(
  reservas: readonly ReservaInforme[], sesiones: readonly SesionInforme[], desde: Date, hasta: Date,
): ResumenPlataforma[] {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  const acc = new Map<Plataforma, ResumenPlataforma>();
  for (const r of reservas) {
    if (!esPlataforma(r.origen) || !enPeriodo(porId.get(r.sesionId), desde, hasta)) continue;
    const fila = acc.get(r.origen) ?? { plataforma: r.origen, vinieron: 0, noVinieron: 0, pendientes: 0, canceladas: 0 };
    if (r.estado === 'ASISTIDA') fila.vinieron++;
    else if (r.estado === 'NO_ASISTIO') fila.noVinieron++;
    else if (r.estado === 'CANCELADA') fila.canceladas++;
    else if (r.estado === 'CONFIRMADA') fila.pendientes++;
    acc.set(r.origen, fila);
  }
  return PLATAFORMAS.filter(p => acc.has(p)).map(p => acc.get(p)!);
}

/** El detalle para descargar: una fila por reserva, ordenadas por fecha. */
export function filasCsvPorOrigen(
  reservas: readonly ReservaInforme[], sesiones: readonly SesionInforme[], desde: Date, hasta: Date,
  nombreClase: (tipoClaseId: string | null | undefined) => string,
  formatoFecha: (iso: string) => string,
): FilaCsvOrigen[] {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  return reservas
    .filter(r => esPlataforma(r.origen) && enPeriodo(porId.get(r.sesionId), desde, hasta))
    .map(r => {
      const s = porId.get(r.sesionId)!;
      return {
        orden: s.inicio,
        fila: {
          fecha: formatoFecha(s.inicio),
          clase: nombreClase(s.tipoClaseId),
          persona: r.nombreExterno ?? '',
          plataforma: NOMBRE_PLATAFORMA[r.origen as Plataforma],
          estado: ESTADO_LEGIBLE[r.estado] ?? r.estado,
        },
      };
    })
    .sort((a, b) => a.orden.localeCompare(b.orden))
    .map(x => x.fila);
}

/** CSV con `;` (lo que abre bien Excel en español) y comillas donde haga falta. */
export function csvDeFilas(filas: readonly FilaCsvOrigen[]): string {
  const celda = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cabecera = ['Fecha', 'Clase', 'Persona', 'Plataforma', 'Estado'];
  return [cabecera, ...filas.map(f => [f.fecha, f.clase, f.persona, f.plataforma, f.estado])]
    .map(l => l.map(celda).join(';'))
    .join('\n');
}
