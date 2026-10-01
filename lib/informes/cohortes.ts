// Cohortes de Informes: de las clientas que EMPEZARON cada mes —su primera
// compra de verdad—, cuántas siguieron viniendo en su segundo y en su tercer mes.
//
// Sustituye a una tabla que decía «cuántas volvieron a los 30/90 días de su
// alta» y no medía eso: agrupaba por `fecha_alta` (metía interesadas e
// importadas), contaba reservas CONFIRMADAS (también la primera clase) y medía la
// ventana desde el día 1 del mes, no desde que cada una empezó.
//
// Quién cuenta: la misma regla que el distintivo «Nueva» de Clientas
// (`lib/clientas/estado.ts`). Es su primera compra que no es de prueba, sin venir
// importada con historial y sin llevar viniendo a clases desde mucho antes.
// «Sigue» = vino a alguna clase (asistida) entre el día 31 y el 60 desde esa
// compra (su 2.º mes), o entre el 61 y el 90 (su 3.er mes).
// Hasta que no ha pasado la ventana entera para TODAS las de ese mes no se sabe:
// `null`, nunca un cero.
// Con menos de MUESTRA_MINIMA_COHORTE, el porcentaje es `null`: con tres
// clientas, una que falta mueve la cifra 33 puntos.
//
// Puro: se prueba con `node --test`.
import { DIAS_VENTANA_PRUEBA, diasEntre, tieneHistorialPrevio } from '../clientas/estado.ts';
import { hoyEnEstudio, masDias } from '../utils.ts';
import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '../types.ts';

export const MUESTRA_MINIMA_COHORTE = 5;

export interface TramoCohorte {
  /** Cuántas vinieron a alguna clase en ese mes de su vida en el estudio. */
  siguen: number;
  /** `null` si son menos de `MUESTRA_MINIMA_COHORTE`. */
  pct: number | null;
}

export interface FilaCohorte {
  /** 'YYYY-MM': el mes en que empezaron. */
  mes: string;
  empezaron: number;
  /** `null`: todavía no ha pasado el segundo mes entero de todas. */
  segundoMes: TramoCohorte | null;
  /** `null`: todavía no ha pasado el tercer mes entero de todas. */
  tercerMes: TramoCohorte | null;
}

export interface DatosCohortes {
  socios: readonly Pick<Socio, 'id' | 'leadStage'>[];
  suscripciones: readonly Pick<Suscripcion, 'socioId' | 'planId' | 'fechaInicio'>[];
  planesTarifa: readonly Pick<PlanTarifa, 'id' | 'esPrueba'>[];
  reservas: readonly Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>[];
  sesiones: readonly Pick<Sesion, 'id' | 'inicio'>[];
}

// Ventanas en días desde la compra (el día de la compra es el 0).
const SEGUNDO_MES: readonly [number, number] = [30, 59];
const TERCER_MES: readonly [number, number] = [60, 89];
const CUENTA_COMO_RESERVA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

/** Los últimos `n` meses ('YYYY-MM') hasta el de `hoyISO`, del más antiguo al actual. */
function ultimosMeses(hoyISO: string, n: number): string[] {
  const y = Number(hoyISO.slice(0, 4));
  const m = Number(hoyISO.slice(5, 7));
  const meses: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    meses.push(d.toISOString().slice(0, 7));
  }
  return meses;
}

function ultimoDiaDelMes(ym: string): string {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
}

export function cohortesPorPrimeraCompra(datos: DatosCohortes, hoyISO: string, meses = 6): FilaCohorte[] {
  const listaMeses = ultimosMeses(hoyISO, meses);
  const desdeMes = listaMeses[0];

  // Su primera compra de verdad. Un plan que ya no está en el catálogo cuenta
  // como de verdad, igual que en el estado: ante la duda, no es «de prueba».
  const esPrueba = new Set(datos.planesTarifa.filter(p => p.esPrueba === true).map(p => p.id));
  const primeraCompra = new Map<string, string>();
  for (const s of datos.suscripciones) {
    const dia = s.fechaInicio?.slice(0, 10);
    if (!dia || esPrueba.has(s.planId)) continue;
    const previa = primeraCompra.get(s.socioId);
    if (!previa || dia < previa) primeraCompra.set(s.socioId, dia);
  }

  // Candidatas: empezaron dentro de los meses de la tabla y no hoy en adelante.
  const historial = new Map(datos.socios.map(s => [s.id, tieneHistorialPrevio(s)]));
  const candidatas = new Map<string, string>();
  for (const [socioId, dia] of primeraCompra) {
    if (dia > hoyISO || dia.slice(0, 7) < desdeMes) continue;
    if (!historial.has(socioId) || historial.get(socioId)) continue;
    candidatas.set(socioId, dia);
  }

  // Sus reservas, en el día del estudio: la primera que contó (para dejar fuera
  // a quien ya venía de antes) y los días a los que vino.
  const inicioDe = new Map(datos.sesiones.map(s => [s.id, s.inicio]));
  const primeraReserva = new Map<string, string>();
  const diasQueVino = new Map<string, string[]>();
  for (const r of datos.reservas) {
    if (!candidatas.has(r.socioId) || !CUENTA_COMO_RESERVA.has(r.estado)) continue;
    const inicio = inicioDe.get(r.sesionId);
    if (!inicio) continue;
    const dia = hoyEnEstudio(new Date(inicio));
    const previa = primeraReserva.get(r.socioId);
    if (!previa || dia < previa) primeraReserva.set(r.socioId, dia);
    if (r.estado === 'ASISTIDA' && dia <= hoyISO) {
      const dias = diasQueVino.get(r.socioId);
      if (dias) dias.push(dia);
      else diasQueVino.set(r.socioId, [dia]);
    }
  }

  const porMes = new Map<string, string[]>(listaMeses.map(m => [m, []]));
  for (const [socioId, compra] of candidatas) {
    // Venir a clases muchos días antes de su primera compra es ser veterana (otro
    // sistema, o antes de que el estudio usara planes), no empezar ahora.
    const primera = primeraReserva.get(socioId);
    if (primera && diasEntre(primera, compra) > DIAS_VENTANA_PRUEBA) continue;
    porMes.get(compra.slice(0, 7))?.push(socioId);
  }

  const tramo = (ids: string[], ventana: readonly [number, number], mes: string): TramoCohorte | null => {
    // Completa cuando ha pasado entera para la última que pudo empezar ese mes.
    if (hoyISO <= masDias(ultimoDiaDelMes(mes), ventana[1])) return null;
    const siguen = ids.filter(id => {
      const compra = candidatas.get(id)!;
      return (diasQueVino.get(id) ?? []).some(dia => {
        const n = diasEntre(compra, dia);
        return n >= ventana[0] && n <= ventana[1];
      });
    }).length;
    return { siguen, pct: ids.length >= MUESTRA_MINIMA_COHORTE ? Math.round((siguen / ids.length) * 100) : null };
  };

  return listaMeses.map(mes => {
    const ids = porMes.get(mes) ?? [];
    return { mes, empezaron: ids.length, segundoMes: tramo(ids, SEGUNDO_MES, mes), tercerMes: tramo(ids, TERCER_MES, mes) };
  });
}
