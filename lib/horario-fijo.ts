// Horario fijo: las clases que se repiten, como las ve la propietaria cuando
// piensa en su estudio — «los lunes a las 9:30 hay Reformer en la sala 1, con
// Marta, hasta junio, y estas cinco vienen fijas».
//
// El calendario solo pinta un rango de fechas; aquí se agrupan TODAS las clases
// futuras de cada serie por día de la semana (una serie de lunes y miércoles son
// dos tarjetas). La plantilla de cada tarjeta es la última clase: refleja
// cualquier «editar esta y las siguientes». Las plazas fijas se emparejan por
// hueco (sala, día, hora local, tipo), igual que el motor. Lógica pura: el
// tiempo entra por `ahoraMs`.

import { franjaLocalDe, hoyEnEstudio } from './utils.ts';
import { horaInicioLocalDe, nombreDiaSemana, normalizarHoraInicio, plazasFijasSinSesion } from './plazas-fijas-slot.ts';
import { estadoPausa } from './plazas-fijas-pausa.ts';
import { fechaDMY } from './series-renovacion.ts';
import type { PlazaFija, Sesion } from './types.ts';

export interface PlazaEnTarjeta {
  id: string;
  socioId: string;
  /** PAUSADA o con una pausa con fechas en curso. */
  enPausa: boolean;
}

export interface TarjetaHorario {
  serieId: string;
  diaSemana: number;          // extract(dow): 0=domingo
  hora: string;               // 'HH:MM' local
  duracionMin: number;
  salaId: string;
  tipoClaseId: string;
  instructorId: string | null;
  aforo: number;
  /** Próxima clase de la serie ese día, a la hora vigente. */
  proximaSesionId: string;
  proximaInicio: string;
  /** Última clase programada (YYYY-MM-DD): hasta cuándo va. */
  ultimaFecha: string;
  clasesFuturas: number;
  renovacionAutomatica: boolean;
  noRenovar: boolean;
  plazasFijas: PlazaEnTarjeta[];
}

export interface DiaHorario { diaSemana: number; tarjetas: TarjetaHorario[] }

export interface HorarioFijo {
  dias: DiaHorario[];
  /** Plazas fijas activas cuyo hueco ya no tiene ninguna clase. */
  huerfanas: PlazaFija[];
}

type SesionHorario = Pick<Sesion, 'id' | 'salaId' | 'tipoClaseId' | 'instructorId' | 'inicio' | 'fin' | 'aforoMaximo' | 'cancelada' | 'serieId'>;
type SerieHorario = { id: string; renovacionAutomatica: boolean; noRenovar: boolean };

const ordenDia = (dow: number) => (dow + 6) % 7;

export function construirHorario(
  sesiones: SesionHorario[],
  series: SerieHorario[],
  plazas: PlazaFija[],
  ahoraMs: number,
): HorarioFijo {
  const hoy = hoyEnEstudio(new Date(ahoraMs));
  const flags = new Map(series.map(s => [s.id, s]));

  const grupos = new Map<string, SesionHorario[]>();
  for (const s of sesiones) {
    if (!s.serieId || s.cancelada) continue;
    const t = Date.parse(s.inicio);
    if (Number.isNaN(t) || t < ahoraMs) continue;
    const clave = `${s.serieId}|${franjaLocalDe(s.inicio).dow}`;
    const lista = grupos.get(clave);
    if (lista) lista.push(s);
    else grupos.set(clave, [s]);
  }

  const tarjetas: TarjetaHorario[] = [];
  for (const lista of grupos.values()) {
    lista.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
    const ultima = lista[lista.length - 1];
    const dow = franjaLocalDe(ultima.inicio).dow;
    const horaSS = horaInicioLocalDe(ultima.inicio);
    // La próxima a la hora VIGENTE: si la serie se editó desde una fecha, las
    // primeras pueden seguir a la hora vieja.
    const proxima = lista.find(s => horaInicioLocalDe(s.inicio) === horaSS) ?? lista[0];
    const f = flags.get(ultima.serieId as string);

    const plazasTarjeta = plazas
      .filter(pf => (pf.estado === 'ACTIVA' || pf.estado === 'PAUSADA')
        && (!pf.vigenciaHasta || pf.vigenciaHasta >= hoy)
        && pf.salaId === ultima.salaId
        && pf.diaSemana === dow
        && normalizarHoraInicio(pf.horaInicio) === horaSS
        && (!pf.tipoClaseId || pf.tipoClaseId === ultima.tipoClaseId))
      .map(pf => ({ id: pf.id, socioId: pf.socioId, enPausa: pf.estado === 'PAUSADA' || estadoPausa(pf, hoy) === 'en_curso' }));

    tarjetas.push({
      serieId: ultima.serieId as string,
      diaSemana: dow,
      hora: horaSS.slice(0, 5),
      duracionMin: Math.max(0, Math.round((Date.parse(ultima.fin) - Date.parse(ultima.inicio)) / 60_000)),
      salaId: ultima.salaId,
      tipoClaseId: ultima.tipoClaseId,
      instructorId: ultima.instructorId || null,
      aforo: ultima.aforoMaximo,
      proximaSesionId: proxima.id,
      proximaInicio: proxima.inicio,
      ultimaFecha: hoyEnEstudio(new Date(ultima.inicio)),
      clasesFuturas: lista.length,
      renovacionAutomatica: f?.renovacionAutomatica ?? false,
      noRenovar: f?.noRenovar ?? false,
      plazasFijas: plazasTarjeta,
    });
  }

  tarjetas.sort((a, b) => ordenDia(a.diaSemana) - ordenDia(b.diaSemana)
    || a.hora.localeCompare(b.hora) || a.salaId.localeCompare(b.salaId));

  const dias: DiaHorario[] = [];
  for (const t of tarjetas) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.diaSemana === t.diaSemana) ultimo.tarjetas.push(t);
    else dias.push({ diaSemana: t.diaSemana, tarjetas: [t] });
  }

  return { dias, huerfanas: plazasFijasSinSesion(plazas, sesiones as Sesion[], ahoraMs) };
}

/** «Se repite cada lunes hasta el 05/10/2026» (sin «hasta» si aún no se sabe). */
export function textoRepeticion(inicioISO: string, serieId: string, horario: HorarioFijo | null): string {
  const dow = franjaLocalDe(inicioISO).dow;
  const base = `Se repite cada ${nombreDiaSemana(dow)}`;
  const tarjeta = horario?.dias.flatMap(d => d.tarjetas).find(t => t.serieId === serieId && t.diaSemana === dow);
  return tarjeta ? `${base} hasta el ${fechaDMY(tarjeta.ultimaFecha)}` : base;
}
