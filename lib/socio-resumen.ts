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
}

export function resumenSocio({
  socio, id, misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now,
}: ResumenSocioInput): ResumenSocio {
  const suscripcion = suscripciones.find(s => s.socioId === id && (s.estado === 'ACTIVA' || s.estado === 'PAUSADA'));
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
  const bonosComprados = suscripciones.filter(s => s.socioId === id).length;
  const totalGastado = misRecibos.filter(r => r.estado === 'COBRADO').reduce((acc, r) => acc + r.importe, 0);
  const pendientes = misRecibos.filter(r => r.estado === 'PENDIENTE');

  const ultimaAsistidaFecha = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]?.inicio ?? null;
  const diasSinVenir = ultimaAsistidaFecha
    ? Math.floor((now.getTime() - new Date(ultimaAsistidaFecha).getTime()) / 86400000)
    : null;

  const suscripcionActiva = suscripciones.find(s => s.socioId === id && s.estado === 'ACTIVA') ?? null;
  const planActivo = suscripcionActiva ? planesTarifa.find(p => p.id === suscripcionActiva.planId) ?? null : null;
  const bonosActivos = suscripciones.filter(s => s.socioId === id && s.estado === 'ACTIVA').length;
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
    pendientesImporte, cumpleanos, sparklineWeeks,
  };
}
