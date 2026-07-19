// ─────────────────────────────────────────────────────────────────────────────
// Motor de huecos de citas 1:1 — puro y testeable (ver slots.test.ts).
//
// Sin React ni Supabase. Expande el horario fino de una instructora
// (`citas_disponibilidad`: franjas por día de la semana) en huecos reservables
// de la duración del servicio, restando las citas/sesiones que ya ocupan su
// agenda, y descartando los huecos que ya han pasado.
//
// TZ: las franjas se guardan como `time` SIN zona (hora de pared del estudio);
// las citas son `timestamptz`. Todo se ancla a **Europe/Madrid** para convertir
// hora-de-pared ↔ instante, respetando el horario de verano (DST) vía Intl.
// El día de la semana usa la convención de Postgres DOW: 0=domingo..6=sábado.
// ─────────────────────────────────────────────────────────────────────────────

export const TZ_CITAS = 'Europe/Madrid';

// Solape de intervalos semiabiertos [aIni,aFin) y [bIni,bFin), en ms. Réplica
// local de `solapan` de lib/calendar-logic para mantener este módulo puro y sin
// imports runtime (los módulos testeados con `node --test` solo importan tipos).
function solapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  const a0 = new Date(aIni).getTime(), a1 = new Date(aFin).getTime();
  const b0 = new Date(bIni).getTime(), b1 = new Date(bFin).getTime();
  if ([a0, a1, b0, b1].some(Number.isNaN)) return false;
  return a0 < b1 && b0 < a1;
}

export interface FranjaDisponibilidad {
  diaSemana: number;    // 0=domingo..6=sábado (Postgres DOW)
  horaInicio: string;   // 'HH:MM' o 'HH:MM:SS'
  horaFin: string;      // 'HH:MM' o 'HH:MM:SS'
}

export interface IntervaloOcupado {
  inicio: string;       // ISO
  fin: string;          // ISO
}

export interface HuecoCita {
  inicio: string;       // ISO (con offset de Madrid resuelto)
  fin: string;          // ISO
}

// Offset de Madrid (en minutos) en un instante dado: (hora-de-pared como-si-UTC)
// menos el UTC real. Positivo al este de Greenwich (Madrid = +60 o +120 en DST).
function offsetMinutos(instante: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(instante);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return (asUTC - instante.getTime()) / 60000;
}

// Convierte una hora de pared de Madrid (fecha local 'YYYY-MM-DD' + 'HH:MM') al
// instante UTC correspondiente. Corrige por el offset vigente en ese momento, así
// que respeta el DST salvo en la hora exacta del salto (caso extremo, aceptable).
export function horaParedAInstante(fechaLocal: string, hhmm: string, tz: string = TZ_CITAS): Date {
  const [y, mo, d] = fechaLocal.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const off = offsetMinutos(new Date(guess), tz);
  return new Date(guess - off * 60000);
}

// Día de la semana (Postgres DOW: 0=domingo) de una fecha local 'YYYY-MM-DD'.
// El día de la semana de una fecha de calendario no depende de la zona horaria.
export function diaSemanaLocal(fechaLocal: string): number {
  const [y, mo, d] = fechaLocal.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function normHora(hhmmss: string): string {
  const [h, m] = hhmmss.split(':');
  return `${h.padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}

// Genera los huecos reservables de un día concreto para una instructora.
export function generarHuecosDia(params: {
  fechaLocal: string;                 // 'YYYY-MM-DD' (calendario Madrid)
  franjas: FranjaDisponibilidad[];    // horario fino de la instructora
  duracionMin: number;                // duración del servicio
  pasoMin?: number;                   // salto entre huecos (default = duración)
  ocupados?: IntervaloOcupado[];      // citas/sesiones que ya ocupan su agenda
  ahora: Date;                        // para descartar huecos ya pasados
  tz?: string;
}): HuecoCita[] {
  const { fechaLocal, franjas, duracionMin, ahora } = params;
  const tz = params.tz ?? TZ_CITAS;
  const paso = params.pasoMin ?? duracionMin;
  const ocupados = params.ocupados ?? [];
  if (duracionMin <= 0 || paso <= 0) return [];

  const dow = diaSemanaLocal(fechaLocal);
  const franjasDia = franjas.filter(f => f.diaSemana === dow);
  const dur = duracionMin * 60000;
  const pasoMs = paso * 60000;
  const ahoraMs = ahora.getTime();

  const huecos: HuecoCita[] = [];
  for (const f of franjasDia) {
    const franjaIni = horaParedAInstante(fechaLocal, normHora(f.horaInicio), tz).getTime();
    const franjaFin = horaParedAInstante(fechaLocal, normHora(f.horaFin), tz).getTime();
    for (let ini = franjaIni; ini + dur <= franjaFin; ini += pasoMs) {
      const fin = ini + dur;
      if (ini < ahoraMs) continue; // hueco ya pasado
      const inicioISO = new Date(ini).toISOString();
      const finISO = new Date(fin).toISOString();
      const choca = ocupados.some(o => solapan(inicioISO, finISO, o.inicio, o.fin));
      if (choca) continue;
      huecos.push({ inicio: inicioISO, fin: finISO });
    }
  }
  huecos.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return huecos;
}

// ¿El intervalo [inicioISO, finISO) cae DENTRO de alguna franja de disponibilidad
// de ese día (en TZ Madrid)? Guardia autoritativa que revalida una reserva
// entrante antes de crearla (la UI solo ofrece huecos válidos, pero el servidor
// no se fía de la UI).
export function dentroDeDisponibilidad(params: {
  inicioISO: string;
  finISO: string;
  franjas: FranjaDisponibilidad[];
  tz?: string;
}): boolean {
  const { inicioISO, finISO, franjas } = params;
  const tz = params.tz ?? TZ_CITAS;
  const ini = new Date(inicioISO).getTime();
  const fin = new Date(finISO).getTime();
  if (Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini) return false;

  // La fecha local (Madrid) del inicio determina el día de la semana y la base
  // sobre la que se anclan las franjas.
  const fechaLocal = fechaLocalDe(new Date(ini), tz);
  const dow = diaSemanaLocal(fechaLocal);
  return franjas.some(f => {
    if (f.diaSemana !== dow) return false;
    const fIni = horaParedAInstante(fechaLocal, normHora(f.horaInicio), tz).getTime();
    const fFin = horaParedAInstante(fechaLocal, normHora(f.horaFin), tz).getTime();
    return ini >= fIni && fin <= fFin;
  });
}

// Fecha local 'YYYY-MM-DD' de un instante en una zona horaria.
export function fechaLocalDe(instante: Date, tz: string = TZ_CITAS): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(instante);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}
