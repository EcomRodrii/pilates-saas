// I10 · Resumen derivado de la ficha de socia. Antes vivía inline en
// app/(dashboard)/socios/[id]/page.tsx, tras el guard `if (!socio)`, y se
// recomputaba en CADA render (p. ej. al teclear en un filtro). Aquí es lógica
// pura y testeable; la página la envuelve en un único useMemo. Acepta `socio`
// posiblemente undefined porque el useMemo corre antes del guard (reglas de
// hooks); en ese caso devuelve valores neutros que la página no llega a pintar.

import type { Socio, Reserva, Recibo, Suscripcion, PlanTarifa, Sesion } from '@/lib/types';
import { cumpleMesDia, formatearCumple } from './socios/datos-privados.ts';
import { importeIngresado, aCentimos, situacionRecibo } from './billing/situacion-recibo.ts';
import { hoyEnEstudio } from './utils.ts';

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

/**
 * Qué plan es «el suyo» cuando tiene varios vivos: el que le da derecho a venir.
 * Primero la cuota vigente, después un bono con clases, y al final lo gastado
 * (una clase suelta ya usada, un bono a 0). Antes valía el primero de la lista:
 * con una clase suelta gastada y la cuota recién asignada, la ficha decía «Plan:
 * Clase Suelta · quedan 0 · +1 bono más» —y ese «bono» era la cuota—, y «Sin
 * plan» cancelaba la clase suelta en vez de la cuota. A igual rango, la ACTIVA
 * antes que la PAUSADA (con «Reanudar» a mano saldrían dos cuotas activas), y
 * después el orden de la lista, como hasta ahora.
 */
export function rangoSuscripcion(s: Suscripcion, planesTarifa: readonly PlanTarifa[], hoyISO: string): number {
  const tipo = planesTarifa.find(p => p.id === s.planId)?.tipo;
  // Vencida (cuota sin renovar, bono caducado) no da derecho a venir: va con lo gastado.
  const vigente = !s.fechaFin || s.fechaFin >= hoyISO;
  if (tipo === 'MENSUAL') return vigente ? 0 : 2;
  if (vigente && (s.sesionesRestantes == null || s.sesionesRestantes > 0)) return 1;
  return 2;
}

function laPrincipal(candidatas: Suscripcion[], planesTarifa: readonly PlanTarifa[], hoyISO: string): Suscripcion | undefined {
  const peso = (s: Suscripcion) => rangoSuscripcion(s, planesTarifa, hoyISO) * 2 + (s.estado === 'PAUSADA' ? 1 : 0);
  let mejor: Suscripcion | undefined;
  for (const s of candidatas) {
    if (!mejor || peso(s) < peso(mejor)) mejor = s;
  }
  return mejor;
}

export function resumenSocio({
  socio, id, misReservas, misRecibos, sesionById, suscripciones, planesTarifa, now,
}: ResumenSocioInput): ResumenSocio {
  const propiasSocio = suscripciones.filter(s => s.socioId === id);
  const hoyISO = hoyEnEstudio(now);
  // Hallazgo B (auditoría dunning 2026-08-10): sin ninguna ACTIVA/PAUSADA, se
  // ofrece la CANCELADA más reciente (por fechaInicio) para que el botón
  // "Reactivar" tenga algo desde lo que dispararse — antes esta tarjeta
  // simplemente desaparecía y la única vía era "Asignar plan" (una
  // suscripción nueva desde cero, perdiendo el histórico de la cancelada).
  const suscripcion =
    laPrincipal(propiasSocio.filter(s => s.estado === 'ACTIVA' || s.estado === 'PAUSADA'), planesTarifa, hoyISO) ??
    propiasSocio
      .filter(s => s.estado === 'CANCELADA')
      .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))[0];
  const plan = suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) ?? null : null;
  const tags = socio?.tags ?? [];

  // Por orden de clase: las reservas llegan en el orden de la base de datos, y
  // sin ordenar, «la próxima» podía ser la del lunes con otra el viernes.
  const proximasReservas = misReservas.filter(r => {
    const ses = sesionById.get(r.sesionId);
    return ses && new Date(ses.inicio) > now && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA');
  }).sort((a, b) => (sesionById.get(a.sesionId)?.inicio ?? '').localeCompare(sesionById.get(b.sesionId)?.inicio ?? ''))
    .slice(0, 3);

  const asistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;
  const estesMes = misReservas.filter(r => {
    const ses = sesionById.get(r.sesionId);
    if (!ses) return false;
    const d = new Date(ses.inicio);
    return r.estado === 'ASISTIDA' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const bonosComprados = propiasSocio.length;
  // Neto de reembolsos (lib/billing/situacion-recibo.ts): lo que de verdad ha
  // pagado. Un reembolso parcial dejaba el recibo COBRADO y se sumaba entero.
  const totalGastado = aCentimos(misRecibos.reduce((acc, r) => acc + importeIngresado(r), 0));
  const pendientes = misRecibos.filter(r => situacionRecibo(r) === 'POR_COBRAR');
  // Impagados (lib/billing/situacion-recibo.ts): FALLIDO y devuelto POR EL BANCO.
  // Con solo FALLIDO, una socia bloqueada por un adeudo devuelto veía su ficha
  // sin ningún aviso de deuda mientras Cobros y la bandeja decían que debía.
  const pagosFallidos = misRecibos.filter(r => situacionRecibo(r) === 'IMPAGADO');

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
  const estaVigente = (s: Suscripcion) => !s.fechaFin || s.fechaFin >= hoyISO;
  const suscripcionActiva = laPrincipal(propiasSocio.filter(s => s.estado === 'ACTIVA' && estaVigente(s)), planesTarifa, hoyISO) ?? null;
  const planActivo = suscripcionActiva ? planesTarifa.find(p => p.id === suscripcionActiva.planId) ?? null : null;
  const bonosActivos = suscripciones.filter(s => s.socioId === id && s.estado === 'ACTIVA' && estaVigente(s)).length;
  const pendientesImporte = pendientes.reduce((acc, r) => acc + r.importe, 0);
  // Día y mes, nunca el año: todo el personal ve esta tarjeta y la fecha
  // completa es dato privado (M1 RGPD). Sin `new Date(iso)`, que en UTC-x
  // restaba un día.
  const cumpleanos = formatearCumple(cumpleMesDia(socio));

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
