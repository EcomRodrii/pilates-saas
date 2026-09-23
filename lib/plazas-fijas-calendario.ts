// El calendario del mes de una clase fija: qué días tiene sitio DE VERDAD.
// Puro y sin `@/`: lo usan el panel (ficha de la clienta), la app de la alumna
// («Tu clase fija») y los tests del runner de Node.
//
// ⚠️ Un día con check es una RESERVA que existe, no una proyección. El motor
// reserva con meses de antelación, pero puede no hacerlo (sin cuota que la
// cubra, clase llena, otra clase a la misma hora): ese día se dice «sin
// reservar» en vez de pintar un check que nadie ha hecho.

export type MarcaDiaFijo = 'RESERVADA' | 'ASISTIDA' | 'NO_ASISTIO' | 'NO_VA' | 'PAUSA' | 'SIN_RESERVA';

export interface PlazaCalendario {
  diaSemana: number;
  /** 'HH:MM[:SS]' en hora del estudio. */
  hora: string;
  salaId: string;
  tipoClaseId: string | null;
  estado: 'ACTIVA' | 'PAUSADA' | 'BAJA';
  vigenciaDesde: string;
  vigenciaHasta: string | null;
  pausaDesde?: string | null;
  pausaHasta?: string | null;
}

/** Una clase del horario, con fecha y hora ya en la zona del estudio. */
export interface SesionCalendario { id: string; fecha: string; hora: string; salaId: string; tipoClaseId: string; cancelada: boolean }

/** Una reserva DE ESTA alumna (quien llama ya las ha filtrado por ella). */
export interface ReservaCalendario { sesionId: string; estado: string }

/** `sesionId`: la clase de ese día, para abrir su ficha. */
export interface DiaFijo { hora: string; marca: MarcaDiaFijo; sesionId: string }

// Si en la misma clase hay varias reservas suyas (canceló y volvió a reservar),
// manda la que dice lo que pasó al final.
const PRIORIDAD: Record<string, number> = { ASISTIDA: 4, NO_ASISTIO: 3, CONFIRMADA: 2, CANCELADA: 1 };
const MARCA: Record<string, MarcaDiaFijo> = { ASISTIDA: 'ASISTIDA', NO_ASISTIO: 'NO_ASISTIO', CONFIRMADA: 'RESERVADA', CANCELADA: 'NO_VA' };

const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

function diasDelMes(mes: string): string[] {
  const [y, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Lo que tiene cada día del mes (`YYYY-MM`) en sus clases fijas. Solo aparecen
 * los días en los que le toca: dentro de la vigencia, en su día de la semana y
 * con una clase de verdad en su horario (un festivo sin clase no se marca).
 */
export function marcasDelMes(
  mes: string, plazas: PlazaCalendario[], sesiones: SesionCalendario[], reservas: ReservaCalendario[], hoy: string,
): Map<string, DiaFijo[]> {
  const salida = new Map<string, DiaFijo[]>();
  const vigentes = plazas.filter((p) => p.estado !== 'BAJA');
  if (vigentes.length === 0) return salida;
  const porSesion = new Map<string, string>();
  for (const r of reservas) {
    if (!(r.estado in PRIORIDAD)) continue;
    const ya = porSesion.get(r.sesionId);
    if (!ya || PRIORIDAD[r.estado] > PRIORIDAD[ya]) porSesion.set(r.sesionId, r.estado);
  }
  for (const fecha of diasDelMes(mes)) {
    const d = dow(fecha);
    for (const p of vigentes) {
      if (p.diaSemana !== d || fecha < p.vigenciaDesde || (p.vigenciaHasta && fecha > p.vigenciaHasta)) continue;
      const hora = p.hora.slice(0, 5);
      const s = sesiones.find((x) => !x.cancelada && x.fecha === fecha && x.hora === hora && x.salaId === p.salaId
        && (!p.tipoClaseId || x.tipoClaseId === p.tipoClaseId));
      if (!s) continue;
      const estado = porSesion.get(s.id);
      const enPausa = (p.pausaDesde && p.pausaHasta && fecha >= p.pausaDesde && fecha <= p.pausaHasta)
        || (p.estado === 'PAUSADA' && fecha >= hoy);
      // Lo que ya pasó manda sobre la pausa: si vino, vino.
      const marca: MarcaDiaFijo | null = estado === 'ASISTIDA' || estado === 'NO_ASISTIO' ? MARCA[estado]
        : enPausa ? 'PAUSA'
        : estado ? MARCA[estado]
        : fecha >= hoy ? 'SIN_RESERVA' : null;
      if (!marca) continue;
      const lista = salida.get(fecha) ?? [];
      lista.push({ hora, marca, sesionId: s.id });
      salida.set(fecha, lista.sort((a, b) => a.hora.localeCompare(b.hora)));
    }
  }
  return salida;
}

/** Las semanas del mes, lunes primero; `null` en los huecos de antes del 1 y después del último. */
export function semanasDelMes(mes: string): (string | null)[][] {
  const dias = diasDelMes(mes);
  const celdas: (string | null)[] = [...Array<null>((dow(dias[0]) + 6) % 7).fill(null), ...dias];
  while (celdas.length % 7 !== 0) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «junio de 2026». */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** Iniciales de la cabecera, lunes primero (X = miércoles, como en cualquier calendario español). */
export const INICIALES_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

/**
 * Hasta qué mes tiene sentido dejar avanzar: el de la última clase de su horario
 * que ya existe, sin pasar del fin de su vigencia. Más allá no hay nada que
 * enseñar (ni reservado ni sin reservar: no hay clase).
 */
export function ultimoMesConClases(plazas: PlazaCalendario[], sesiones: SesionCalendario[], hoy: string): string {
  const vigentes = plazas.filter((p) => p.estado !== 'BAJA');
  let max = hoy;
  for (const s of sesiones) {
    if (s.cancelada || s.fecha <= max) continue;
    const suya = vigentes.some((p) => p.diaSemana === dow(s.fecha) && p.hora.slice(0, 5) === s.hora && p.salaId === s.salaId
      && s.fecha >= p.vigenciaDesde && (!p.vigenciaHasta || s.fecha <= p.vigenciaHasta));
    if (suya) max = s.fecha;
  }
  return max.slice(0, 7);
}
