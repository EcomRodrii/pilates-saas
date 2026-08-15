import type {
  Sesion, TipoClase, Sala, Instructor, Spot, Reserva, Suscripcion, PlanTarifa,
  SustitucionConfirmadaPublica,
} from '@/lib/types';
import type { ReservaSlot } from '@/components/reserva/reserva-calendario';
import type { SociaSesion } from '@/lib/use-socia-session';
import { tieneEntitlementActivo } from '../bono-logic.ts';
import { claseSirvePara } from './objetivos.ts';

function pad2(n: number) { return String(n).padStart(2, '0'); }
// Fecha local (no UTC) en formato YYYY-MM-DD — mismo helper que ya usa
// app/reservar/[slug]/page.tsx, duplicado aquí porque no está exportado de
// ningún módulo compartido.
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Proyección pura sesiones-crudas → ReservaSlot[], sacada de
// app/reservar/[slug]/page.tsx para que el bundle embebible (Modo B) pueda
// pintar el mismo calendario sin duplicar esta lógica — es la MISMA cuenta
// (aforo/spots/sustituciones/precio/filtros) que ya usa el widget iframe.
// No se toca lib/studio-context.tsx: esto es una función nueva y pequeña,
// no una extracción de las ~15 funciones de escritura del provider.
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

export function horarioDeSesion(iso: string): 'manana' | 'mediodia' | 'tarde' {
  const h = new Date(iso).getHours();
  if (h < 12) return 'manana';
  if (h < 17) return 'mediodia';
  return 'tarde';
}

export interface FiltrosSlots {
  tipo?: string | null;
  nivel?: string | null;
  instructorNombre?: string | null;
  objetivo?: string | null;
  horario?: 'manana' | 'mediodia' | 'tarde' | null;
  dias?: number[];
}

export interface EntradaConstruirSlots {
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  reservas: Reserva[];
  spots: Spot[];
  sustitucionesConfirmadas: SustitucionConfirmadaPublica[];
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  socia: SociaSesion | null;
  bookingSesionId?: string | null;
  nowMs: number;
  filtros?: FiltrosSlots;
}

export function construirSlots(entrada: EntradaConstruirSlots): ReservaSlot[] {
  const {
    sesiones, tiposClase, salas, instructores, reservas, spots,
    sustitucionesConfirmadas, suscripciones, planesTarifa, socia,
    bookingSesionId, nowMs, filtros = {},
  } = entrada;

  const tiposById = new Map(tiposClase.map(t => [t.id, t]));
  const salasById = new Map(salas.map(x => [x.id, x]));
  const instrById = new Map(instructores.map(i => [i.id, i]));
  const ocupadasTotalPorSesion = new Map<string, number>();
  for (const r of reservas) {
    if (r.estado === 'CANCELADA') continue;
    ocupadasTotalPorSesion.set(r.sesionId, (ocupadasTotalPorSesion.get(r.sesionId) ?? 0) + 1);
  }
  const originalPorSesion = new Map(sustitucionesConfirmadas.map(s => [s.sesionId, s.instructorOriginalId]));
  const sesionesRich = sesiones.map(s => ({
    ...s,
    tipo: tiposById.get(s.tipoClaseId),
    sala: salasById.get(s.salaId),
    instructor: instrById.get(s.instructorId),
    instructorOriginalNombre: instrById.get(originalPorSesion.get(s.id) ?? '')?.nombre ?? null,
    ocupadas: ocupadasTotalPorSesion.get(s.id) ?? 0,
  }));

  const ocupadasPorSesion = new Map<string, number>();
  const spotsOcupadosPorSesion = new Map<string, string[]>();
  const miReservaPorSesion = new Map<string, Reserva>();
  const socioId = socia?.socioId ?? null;
  for (const r of reservas) {
    if (OCUPA_PLAZA.includes(r.estado)) {
      ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
      if (r.spotId) {
        const arr = spotsOcupadosPorSesion.get(r.sesionId) ?? [];
        arr.push(r.spotId);
        spotsOcupadosPorSesion.set(r.sesionId, arr);
      }
    }
    if (socioId && r.socioId === socioId && RESERVA_ACTIVA.includes(r.estado)) {
      miReservaPorSesion.set(r.sesionId, r);
    }
  }

  const spotsActivosPorSala = new Map<string, Spot[]>();
  for (const sp of spots) {
    if (!sp.activo) continue;
    const arr = spotsActivosPorSala.get(sp.salaId) ?? [];
    arr.push(sp);
    spotsActivosPorSala.set(sp.salaId, arr);
  }

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;
  const tipoClaseAbierta = bookingSesionId ? (sesiones.find(x => x.id === bookingSesionId)?.tipoClaseId ?? null) : null;
  const cubierta = socia?.socioId
    ? tieneEntitlementActivo(socia.socioId, suscripciones, planesTarifa, localDate(new Date(nowMs)), tipoClaseAbierta)
    : false;

  return sesionesRich
    .filter(s => !s.cancelada && new Date(s.inicio).getTime() > nowMs)
    .filter(s => !filtros.tipo || s.tipoClaseId === filtros.tipo)
    .filter(s => !filtros.nivel || (s.tipo?.nivel ?? 'TODOS') === filtros.nivel)
    .filter(s => !filtros.instructorNombre || s.instructor?.nombre === filtros.instructorNombre)
    .filter(s => claseSirvePara({ objetivos: s.tipo?.objetivos ?? null }, filtros.objetivo ?? ''))
    .filter(s => !filtros.horario || horarioDeSesion(s.inicio) === filtros.horario)
    .filter(s => !filtros.dias?.length || filtros.dias.includes(new Date(s.inicio).getDay()))
    .map(s => {
      const mia = miReservaPorSesion.get(s.id) ?? null;
      return {
        id: s.id,
        inicio: s.inicio,
        fin: s.fin,
        tipoClaseId: s.tipoClaseId,
        claseNombre: s.tipo?.nombre ?? 'Clase',
        claseColor: s.tipo?.color ?? 'var(--portal-brand)',
        claseFotoUrl: s.tipo?.fotoUrl ?? null,
        nivel: s.tipo?.nivel ?? 'TODOS',
        descripcion: s.tipo?.descripcion ?? null,
        instructorNombre: s.instructor?.nombre ?? null,
        instructorColor: s.instructor?.color ?? null,
        instructorRol: s.instructor?.rol ?? null,
        instructorFotoUrl: s.instructor?.fotoUrl ?? null,
        instructorOriginalNombre: s.instructorOriginalNombre,
        salaNombre: s.sala?.nombre ?? null,
        aforoMaximo: s.aforoMaximo,
        ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
        spots: s.salaId ? (spotsActivosPorSala.get(s.salaId) ?? []) : [],
        spotsOcupados: spotsOcupadosPorSesion.get(s.id) ?? [],
        miReservaId: mia?.id ?? null,
        miEstado: mia ? (mia.estado as 'CONFIRMADA' | 'LISTA_ESPERA') : null,
        miOfertaExpiraEn: mia?.ofertaExpiraEn ?? null,
        precio: cubierta ? null : precioClaseSuelta,
      } satisfies ReservaSlot;
    });
}
