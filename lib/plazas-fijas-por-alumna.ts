// Las clases fijas vistas por ALUMNA, como «Turnos» de Bonsai (b-87): quién
// viene fija, a qué, hasta cuándo y qué le pasa a cada una. El Horario del
// calendario las enseña por clase; esto es la otra pregunta del mostrador,
// «¿qué tiene fijo Carmen?» y «¿a quién se le ha quedado una sin cuota?».
//
// Solo lee: las reglas son las mismas que la ficha de la clienta
// (components/socios/ficha-plaza-fija.tsx), con sus mismas funciones —
// `estadoPausa`, `plazasFijasSinSesion`, `cuotaParaPlazaFija—`, para que las
// dos pantallas no puedan decir cosas distintas de la misma clase fija.
// Lógica pura: el tiempo entra por `ahoraMs`.

import { hoyEnEstudio } from './utils.ts';
import { plazasFijasSinSesion } from './plazas-fijas-slot.ts';
import { estadoPausa } from './plazas-fijas-pausa.ts';
import { cuotaParaPlazaFija } from './plazas-fijas-reglas.ts';
import type { PlanTarifa, PlazaFija, Sesion, Suscripcion } from './types.ts';

/** Cómo está una clase fija hoy. */
export type EstadoClaseFija =
  | 'activa'
  | 'pausa_programada'   // activa, con una pausa con fechas que aún no ha empezado
  | 'en_pausa'           // pausa con fechas en curso, o PAUSADA sin más
  | 'vuelta_por_decidir'; // la pausa soltó su sitio, ya acabó y falta decidir su vuelta

export interface FilaClaseFija {
  plaza: PlazaFija;
  estado: EstadoClaseFija;
  /** Su horario ya no tiene ninguna clase en las próximas semanas (la clase se movió). */
  sinClase: boolean;
  /** Activa y sin cuota que incluya la clase: el motor no le reserva nada. */
  sinCuota: boolean;
}

export interface AlumnaConClasesFijas {
  socioId: string;
  nombre: string;
  filas: FilaClaseFija[];
  /** Cuántas de sus clases fijas piden que alguien haga algo. */
  avisos: number;
}

const ordenDia = (dow: number) => (dow + 6) % 7;

export function estadoDeClaseFija(p: PlazaFija, hoy: string): EstadoClaseFija {
  const pausa = estadoPausa(p, hoy);
  if (p.estado === 'PAUSADA' && p.pausaLiberaSitio === true && pausa === 'sin_pausa') return 'vuelta_por_decidir';
  if (p.estado === 'PAUSADA' || pausa === 'en_curso') return 'en_pausa';
  if (pausa === 'programada') return 'pausa_programada';
  return 'activa';
}

/** Las alumnas con alguna clase fija viva (no de baja), por nombre, y sus clases por día y hora. */
export function clasesFijasPorAlumna(entrada: {
  plazasFijas: PlazaFija[];
  sesiones: Sesion[];
  suscripciones: Suscripcion[];
  planes: PlanTarifa[];
  nombreDe: (socioId: string) => string;
  ahoraMs: number;
}): AlumnaConClasesFijas[] {
  const hoy = hoyEnEstudio(new Date(entrada.ahoraMs));
  const vivas = entrada.plazasFijas.filter(p => p.estado !== 'BAJA');
  const huerfanas = new Set(plazasFijasSinSesion(vivas, entrada.sesiones, entrada.ahoraMs).map(p => p.id));
  const porSocia = new Map<string, PlazaFija[]>();
  for (const p of vivas) {
    const l = porSocia.get(p.socioId);
    if (l) l.push(p);
    else porSocia.set(p.socioId, [p]);
  }
  const out: AlumnaConClasesFijas[] = [];
  for (const [socioId, plazas] of porSocia) {
    plazas.sort((a, b) => ordenDia(a.diaSemana) - ordenDia(b.diaSemana) || a.horaInicio.localeCompare(b.horaInicio));
    const filas = plazas.map((plaza): FilaClaseFija => ({
      plaza,
      estado: estadoDeClaseFija(plaza, hoy),
      sinClase: huerfanas.has(plaza.id),
      sinCuota: plaza.estado === 'ACTIVA' && !cuotaParaPlazaFija(socioId, entrada.suscripciones, entrada.planes, hoy, plaza.tipoClaseId),
    }));
    out.push({
      socioId,
      nombre: entrada.nombreDe(socioId),
      filas,
      avisos: filas.filter(f => f.sinClase || f.sinCuota || f.estado === 'vuelta_por_decidir').length,
    });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export type FiltroEstadoClaseFija = 'todas' | 'activas' | 'en_pausa' | 'con_aviso';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Filtra por nombre, estado y día; una alumna sale si le queda alguna clase fija que cumpla. */
export function filtrarClasesFijas(
  alumnas: AlumnaConClasesFijas[],
  f: { texto: string; estado: FiltroEstadoClaseFija; dia: number | null },
): AlumnaConClasesFijas[] {
  const q = sinAcentos(f.texto.trim());
  const cumple = (x: FilaClaseFija) =>
    (f.dia === null || x.plaza.diaSemana === f.dia)
    && (f.estado === 'todas'
      || (f.estado === 'activas' && (x.estado === 'activa' || x.estado === 'pausa_programada'))
      || (f.estado === 'en_pausa' && (x.estado === 'en_pausa' || x.estado === 'vuelta_por_decidir'))
      || (f.estado === 'con_aviso' && (x.sinClase || x.sinCuota || x.estado === 'vuelta_por_decidir')));
  return alumnas
    .filter(a => !q || sinAcentos(a.nombre).includes(q))
    .map(a => ({ ...a, filas: a.filas.filter(cumple) }))
    .filter(a => a.filas.length > 0);
}
