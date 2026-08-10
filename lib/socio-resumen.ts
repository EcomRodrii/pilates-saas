// I10 · Resumen derivado de la ficha de socia. Antes vivía inline en
// app/(dashboard)/socios/[id]/page.tsx, tras el guard `if (!socio)`, y se
// recomputaba en CADA render (p. ej. al teclear en un filtro). Aquí es lógica
// pura y testeable; la página la envuelve en un único useMemo. Acepta `socio`
// posiblemente undefined porque el useMemo corre antes del guard (reglas de
// hooks); en ese caso devuelve valores neutros que la página no llega a pintar.

import type { Socio, Reserva, Recibo, Suscripcion, PlanTarifa, Sesion } from '@/lib/types';

export interface ResumenSocioInput {
  socio: Socio | undefined;
  id: string;
  misReservas: Reserva[];
  misRecibos: Recibo[];
  sesionById: Map<string, Sesion>;
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  now: Date;
}

export interface ResumenSocio {
  suscripcion: Suscripcion | undefined;
  plan: PlanTarifa | null;
  tags: string[];
  proximasReservas: Reserva[];
  asistidas: number;
  estesMes: number;
  bonosComprados: number;
  totalGastado: number;
  pendientes: Recibo[];
  diasSinVenir: number | null;
  planActivo: PlanTarifa | null;
  bonosActivos: number;
  pendientesImporte: number;
  cumpleanos: string | null;
  sparklineWeeks: boolean[];
  // Distinto de `pendientes` (PENDIENTE = en pleno ciclo de reintento, puede
  // resolverse solo): FALLIDO es el estado TERMINAL tras agotar los
  // reintentos de dunning (+1/+3/+7 días) — mezclar los dos en la misma
  // suma perdería la distinción que el propio dunning ya calcula.
  pagosFallidos: Recibo[];
}

export function resumenSocio({
  socio, id, misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now,
}: ResumenSocioInput): ResumenSocio {
  const propiasSocio = suscripciones.filter(s => s.socioId === id);
  // Hallazgo B (auditoría dunning 2026-08-10): sin ninguna ACTIVA/PAUSADA, se
  // ofrece la CANCELADA más reciente (por fechaInicio) para que el botón
  // "Reactivar" tenga algo desde lo que dispararse — antes esta tarjeta
  // simplemente desaparecía y la única vía era "Asignar plan" (una
  // suscripción nueva desde cero, perdiendo el histórico de la cancelada).
  const suscripcion =
    propiasSocio.find(s => s.estado === 'ACTIVA' || s.estado === 'PAUSADA') ??
    propiasSocio
      .filter(s => s.estado === 'CANCELADA')
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0];
  const plan = suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) ?? null : null;
  const tags = socio?.tags ?? [];

  const proximasReservas = misReservas.filter(r => {
    const ses = sesionById.get(r.sesionId);
    return ses && new Date(ses.inicio) > now && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA');
  }).slice(0, 3);

  const asistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;
  const estesMes = misReservas.filter(r => {
    const ses = sesionById.get(r.sesionId);
    if (!ses) return false;
    const d = new Date(ses.inicio);
    return r.estado === 'ASISTIDA' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const bonosComprados = propiasSocio.length;
  const totalGastado = misRecibos.filter(r => r.estado === 'COBRADO').reduce((acc, r) => acc + r.importe, 0);
  const pendientes = misRecibos.filter(r => r.estado === 'PENDIENTE');
  const pagosFallidos = misRecibos.filter(r => r.estado === 'FALLIDO');

  const ultimaAsistidaFecha = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]?.inicio ?? null;
  // Red de seguridad, no la corrección real (#870: el check-in ya no debería
  // poder marcarse sobre una clase futura). Si por lo que sea la fecha de
  // "última asistencia" queda en el futuro, mostrar "Hace -1 días" es peor
  // que mostrar "Hoy" — es un valor sin sentido que mina la confianza en el
  // resto de los datos.
  const diasSinVenir = ultimaAsistidaFecha
    ? Math.max(0, Math.floor((now.getTime() - new Date(ultimaAsistidaFecha).getTime()) / 86400000))
    : null;

  // Hallazgo A (auditoria dunning 2026-08-10): una ACTIVA con fecha_fin ya
  // vencida no cuenta como activa aqui — defensa en profundidad ademas de la
  // auto-cancelacion del dunning (que ya deja el estado en CANCELADA hacia
  // adelante, pero este contador no debe fiarse ciegamente de que quedo
  // sincronizado).
  const hoyISO = now.toISOString().slice(0, 10);
  const estaVigente = (s: Suscripcion) => !s.fechaFin || s.fechaFin >= hoyISO;
  const suscripcionActiva = suscripciones.find(s => s.socioId === id && s.estado === 'ACTIVA' && estaVigente(s)) ?? null;
  const planActivo = suscripcionActiva ? planesTarifa.find(p => p.id === suscripcionActiva.planId) ?? null : null;
  const bonosActivos = suscripciones.filter(s => s.socioId === id && s.estado === 'ACTIVA' && estaVigente(s)).length;
  const pendientesImporte = pendientes.reduce((acc, r) => acc + r.importe, 0);
  const cumpleanos = socio?.fechaNacimiento
    ? new Date(socio.fechaNacimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : null;

  // Sparkline de asistencia de las últimas 12 semanas.
  const sparklineWeeks = Array.from({ length: 12 }, (_, i) => {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (11 - i) * 7 - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return misReservas.some(r => {
      const ses = sesionById.get(r.sesionId);
      if (!ses) return false;
      const d = new Date(ses.inicio);
      return r.estado === 'ASISTIDA' && d >= weekStart && d < weekEnd;
    });
  });

  return {
    suscripcion, plan, tags, proximasReservas, asistidas, estesMes, bonosComprados,
    totalGastado, pendientes, diasSinVenir, planActivo, bonosActivos,
    pendientesImporte, cumpleanos, sparklineWeeks, pagosFallidos,
  };
}
