// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — agrupar las sesiones de un día en columnas de sala
// (punto 2). Puro: no sabe nada de React ni de posiciones en píxeles, solo
// agrupa, aplica carriles (lib/calendario-carriles.ts) y calcula la cabecera
// de cada sala (nº de clases, ocupación media, si hay algo que atender).
// ─────────────────────────────────────────────────────────────────────────────

import type { Sala } from './types.ts';
import { asignarCarriles } from './calendario-carriles.ts';
import { ratioOcupacion } from './ocupacion.ts';
import { pideDecision, type EstadoSesion } from './calendario-estado.ts';

export interface SesionColumna {
  id: string;
  inicioMin: number;
  finMin: number;
  salaId: string;
  estado: EstadoSesion;
  confirmadas: number;
  enEspera: number;
  aforoMaximo: number;
  /** La clase ya terminó (fecha real, no solo finMin del día) — ver nota en pideDecision. */
  finalizada: boolean;
}

export interface SesionEnColumna extends SesionColumna {
  carril: number;
  totalCarriles: number;
}

export interface ColumnaSala {
  sala: Sala;
  sesiones: SesionEnColumna[];
  /** 0..1, media de ocupación de las clases de esta sala hoy. 0 si no hay clases. */
  ocupacionMedia: number;
  /** Alguna clase de esta sala hoy exige una decisión (punto 3). */
  hayAtencion: boolean;
}

export function prepararColumnasSalaDia(
  sesiones: SesionColumna[],
  salas: Sala[],
  salaFiltro: string, // 'todas' o el id de una sala concreta (punto 9)
): ColumnaSala[] {
  const salasVisibles = salaFiltro === 'todas' ? salas : salas.filter(s => s.id === salaFiltro);

  return salasVisibles.map(sala => {
    const deLaSala = sesiones.filter(s => s.salaId === sala.id);
    const { puesto, total } = asignarCarriles(deLaSala.map(s => ({ id: s.id, inicioMin: s.inicioMin, finMin: s.finMin })));

    const conCarril: SesionEnColumna[] = deLaSala.map(s => ({
      ...s,
      carril: puesto.get(s.id) ?? 0,
      totalCarriles: total.get(s.id) ?? 1,
    }));

    const ratios = deLaSala.map(s => ratioOcupacion(s.confirmadas, s.aforoMaximo));
    const ocupacionMedia = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    const hayAtencion = deLaSala.some(s => pideDecision(s.estado, {
      enEspera: s.enEspera,
      sobreaforo: Math.max(0, s.aforoMaximo - sala.capacidad),
      huecosLibres: Math.max(0, s.aforoMaximo - s.confirmadas),
      finalizada: s.finalizada,
    }));

    return { sala, sesiones: conCarril, ocupacionMedia, hayAtencion };
  });
}

// ─── Vista de SEMANA (punto 2, "7 columnas para planificar") ────────────────

export interface SesionSemana extends SesionColumna {
  /** 0 = lunes … 6 = domingo. */
  dia: number;
}

export interface ColumnaDia {
  dia: number;
  sesiones: SesionEnColumna[];
  ocupacionMedia: number;
  hayAtencion: boolean;
  /** Sin clases programadas este día — puede pasar dentro de horario normal
   *  (nadie ha metido nada aún) y no significa que el estudio esté cerrado. */
  vacio: boolean;
  /** El horario del estudio (studio_horario) marca este día como no laborable.
   *  Independiente de `vacio`: un día "cerrado" nunca tiene clases, pero un
   *  día "vacío" puede estar perfectamente abierto. Si no llega `horarioSemana`
   *  al caller, nunca se afirma "cerrado" sin dato real (queda en `false`). */
  cerrado: boolean;
}

// Índice por `dia` (0=lunes..6=domingo, misma convención local que `dia` de
// arriba) de si el estudio abre ese día, según lib/types.ts:DiaHorario —cuya
// `diaSemana` usa la convención EXTRACT(DOW) (0=domingo)—; la conversión la
// hace el caller antes de pasar este array.
export interface DiaAbiertoLocal {
  dia: number;
  abierto: boolean;
}

// Sin sala de por medio: los carriles se calculan sobre TODO lo del día
// (varias salas a la vez), igual que hace el prototipo, porque el punto de la
// semana es planificar de un vistazo, no distinguir sala por sala.
export function prepararColumnasDiaSemana(sesiones: SesionSemana[], horarioSemana?: DiaAbiertoLocal[]): ColumnaDia[] {
  const cerradoPorDia = new Map(horarioSemana?.map(h => [h.dia, !h.abierto]));
  return Array.from({ length: 7 }, (_, dia) => {
    const delDia = sesiones.filter(s => s.dia === dia);
    const { puesto, total } = asignarCarriles(delDia.map(s => ({ id: s.id, inicioMin: s.inicioMin, finMin: s.finMin })));

    const conCarril: SesionEnColumna[] = delDia.map(s => ({
      ...s,
      carril: puesto.get(s.id) ?? 0,
      totalCarriles: total.get(s.id) ?? 1,
    }));

    const ratios = delDia.map(s => ratioOcupacion(s.confirmadas, s.aforoMaximo));
    const ocupacionMedia = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

    // Sin capacidad de sala aquí (una columna de semana mezcla salas): el
    // sobreaforo de cada sesión ya viene resuelto por el caller si aplica —
    // de lo contrario esta señal solo mira lista de espera y estados graves.
    const hayAtencion = delDia.some(s => pideDecision(s.estado, {
      enEspera: s.enEspera,
      sobreaforo: 0,
      huecosLibres: Math.max(0, s.aforoMaximo - s.confirmadas),
      finalizada: s.finalizada,
    }));

    return { dia, sesiones: conCarril, ocupacionMedia, hayAtencion, vacio: delDia.length === 0, cerrado: cerradoPorDia.get(dia) ?? false };
  });
}
