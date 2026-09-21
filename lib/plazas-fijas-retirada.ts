// Qué clases soltar cuando se pausa o se quita una plaza fija.
//
// Antes, pausar o quitar solo cambiaba el estado de la plaza: las reservas que
// ya había creado (hasta 180 días por delante) seguían CONFIRMADAS, la socia
// seguía apareciendo apuntada y la máquina seguía ocupada para nadie.
//
// Se sueltan sus reservas activas en clases FUTURAS que encajan en el slot de la
// plaza — también las que se apuntaron a mano en ese mismo horario: con plaza
// fija en ese hueco, esa reserva ES la de su plaza (la materialización se la
// salta precisamente por eso).
//
// ⚠️ Las CONFIRMADAS que ya están dentro del plazo de cancelación se MANTIENEN.
// Pausar no puede ser un atajo para cancelar tarde sin consecuencias; la de hoy
// se cancela aparte, con las reglas de siempre. Salir de una lista de espera no
// tiene plazo, así que esas se sueltan siempre.
//
// `rango` (pausa con fechas): solo las clases cuya fecha LOCAL cae dentro, los
// dos días incluidos. Sin rango, todas las futuras (quitar o cambiar de clase).
//
// Lógica pura: el tiempo entra por `ahoraMs` y la ventana ya resuelta por
// sesión (el tipo de clase manda sobre el estudio), para que los tests sean
// deterministas.

import { sesionEncajaEnPlaza, type SesionSlot } from './plazas-fijas-slot.ts';
import { esCancelacionTardia } from './booking-logic.ts';
import { hoyEnEstudio } from './utils.ts';
import type { PlazaFija, Reserva } from './types.ts';

export interface ReservasARetirar {
  /** Se cancelan. */
  retirar: string[];
  /** CONFIRMADAS dentro del plazo de cancelación: se quedan. */
  mantener: string[];
}

export function reservasARetirarDePlaza(
  pf: PlazaFija,
  sesiones: (SesionSlot & { id: string; cancelada?: boolean | null })[],
  reservas: Pick<Reserva, 'id' | 'sesionId' | 'socioId' | 'estado'>[],
  ahoraMs: number,
  ventanaHorasDe: (sesionId: string) => number,
  rango?: { desde: string; hasta: string },
): ReservasARetirar {
  const porId = new Map(sesiones.map(s => [s.id, s]));
  const retirar: string[] = [];
  const mantener: string[] = [];
  for (const r of reservas) {
    if (r.socioId !== pf.socioId) continue;
    if (r.estado !== 'CONFIRMADA' && r.estado !== 'LISTA_ESPERA') continue;
    const s = porId.get(r.sesionId);
    if (!s || s.cancelada) continue;
    const inicioMs = Date.parse(s.inicio);
    if (Number.isNaN(inicioMs) || inicioMs <= ahoraMs) continue;
    if (!sesionEncajaEnPlaza(pf, s)) continue;
    if (rango) {
      const fecha = hoyEnEstudio(new Date(s.inicio));
      if (fecha < rango.desde || fecha > rango.hasta) continue;
    }
    if (r.estado === 'CONFIRMADA' && esCancelacionTardia(s.inicio, new Date(ahoraMs), ventanaHorasDe(r.sesionId))) {
      mantener.push(r.id);
    } else {
      retirar.push(r.id);
    }
  }
  return { retirar, mantener };
}
