// Especialista en Ingresos — ¿dónde estamos dejando dinero? (MVP: I1-I3).
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Recibo } from '@/lib/types';
import {
  construirIndices, frecuenciaHabitual, agruparFranjasRecurrentes, demandaInsatisfecha, pagosEnRiesgo,
  impagosManualesPorSocio,
  type IndicesSenal, type FranjaRecurrente,
} from '../senales.ts';
import { confianzaAbrirSesion, confianzaRecuperarPagos, confianzaCobrarPendienteManual } from '../confianza.ts';

const MS_DIA = 86400000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Heurística MVP de capacidad física: existe una sala no usada en esta franja
 * con aforo suficiente. Una comprobación fina de huecos por sala/instructor y
 * franjas adyacentes ±1h es responsabilidad del Especialista Agenda (Fase E) —
 * esta versión evita proponer una clase físicamente imposible sin necesitar
 * ese módulo todavía.
 */
function hayCapacidadFisica(franja: FranjaRecurrente, s: SnapshotEstudio): boolean {
  const salasUsadas = new Set(franja.sesionesOrdenadas.map(se => se.salaId));
  const aforoReferencia = franja.sesionesOrdenadas[0]?.aforoMaximo ?? 0;
  return s.salas.some(sala => !salasUsadas.has(sala.id) && sala.capacidad >= aforoReferencia);
}

/**
 * Precio medio por sesión, ponderado por socias activas (Especialistas §2.2):
 * MENSUAL → precio/(frecuenciaHabitual×4.33) · BONO → precio/sesiones · PUNTUAL → precio.
 */
function precioMedioSesion(s: SnapshotEstudio, idx: IndicesSenal): number {
  const precios: number[] = [];
  for (const socio of s.socios) {
    if (!socio.activo) continue;
    const sus = idx.suscripcionActivaPorSocio.get(socio.id);
    if (!sus) continue;
    const plan = idx.planPorId.get(sus.planId);
    if (!plan) continue;
    if (plan.tipo === 'MENSUAL') {
      const freq = frecuenciaHabitual(socio.id, idx);
      if (freq !== null && freq > 0) precios.push(plan.precio / (freq * 4.33));
    } else if (plan.tipo === 'BONO' && plan.sesiones && plan.sesiones > 0) {
      precios.push(plan.precio / plan.sesiones);
    } else if (plan.tipo === 'PUNTUAL') {
      precios.push(plan.precio);
    }
  }
  if (precios.length === 0) return 0;
  return precios.reduce((a, b) => a + b, 0) / precios.length;
}

/** I1 · Demanda desbordada → ABRIR_SESION. */
function reglaI1(clave: string, franja: FranjaRecurrente, s: SnapshotEstudio, idx: IndicesSenal): Candidata | null {
  const OCURRENCIAS_MINIMAS = 3;
  if (franja.sesionesOrdenadas.length < OCURRENCIAS_MINIMAS) return null;

  const ultimas3 = franja.ocupaciones.slice(0, OCURRENCIAS_MINIMAS);
  const llenaConsistente = ultimas3.every(o => o >= 0.95);
  if (!llenaConsistente) return null;

  const demanda = demandaInsatisfecha(franja, s, OCURRENCIAS_MINIMAS);
  const ultimas5 = franja.ocupaciones.slice(0, 5);
  const media5Completa = ultimas5.length >= 5 && ultimas5.every(o => o >= 1);
  if (demanda < 2 && !media5Completa) return null;

  if (!hayCapacidadFisica(franja, s)) return null;

  const referencia = franja.sesionesOrdenadas[0];
  const tipo = idx.tipoClasePorId.get(referencia.tipoClaseId);
  const inicioRef = new Date(referencia.inicio);
  const diaSemana = inicioRef.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  const hora = inicioRef.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  let semanasConsecutivas = 0;
  for (const o of franja.ocupaciones) {
    if (o >= 0.95) semanasConsecutivas++;
    else break;
  }

  const plazasEstimadas = Math.max(1, Math.min(Math.round(demanda), referencia.aforoMaximo));
  const precioMedio = precioMedioSesion(s, idx);
  const valor = redondear2(plazasEstimadas * precioMedio * 4.33);

  const confianza = confianzaAbrirSesion({
    franjaLlenaConsistente: llenaConsistente,
    demandaInsatisfecha: demanda >= 2,
    patronSostenido: semanasConsecutivas >= 5,
  });
  if (!confianza) return null;

  const motivoMotor = `Llevas ${semanasConsecutivas} semanas con gente en lista de espera. Si abrimos una segunda sesión, creo que también se llenaría. Serían unos +${valor}€/mes.`;

  return {
    especialista: 'INGRESOS',
    tipo: 'ABRIR_SESION',
    dedupeKey: `INGRESOS:ABRIR_SESION:${clave}`,
    tituloMotor: `Tu clase del ${diaSemana} a las ${hora} se llena sola`,
    motivoMotor,
    datosUsados: {
      tipoClase: tipo?.nombre ?? 'clase', diaSemana, hora, semanasConsecutivas,
      plazasEstimadas, precioMedioSesion: redondear2(precioMedio), demandaInsatisfecha: redondear1(demanda),
    },
    riesgo: 'OPORTUNIDAD',
    impacto: valor > 0
      ? { valor, unidad: 'EUR_MES', formula: `${plazasEstimadas} plazas × ${redondear2(precioMedio)}€/sesión × 4.33 semanas (lista de espera de ${redondear1(demanda)} las últimas ${OCURRENCIAS_MINIMAS} semanas)` }
      : undefined,
    confianza,
    accion: { tipo: 'MARCAR_GESTIONADO' },
    tiempoEstimadoMin: 10,
    expiraEnDias: 21,
    urgencia: Math.min(0.9, 0.5 + 0.1 * semanasConsecutivas),
    esfuerzo: 0.5,
  };
}

/** I2 · Dinero parado con tarjeta guardada → RECUPERAR_PAGOS (una candidata agregada, nunca N tarjetas). */
function reglaI2(s: SnapshotEstudio, idx: IndicesSenal, now: Date): Candidata | null {
  const { conTarjeta } = pagosEnRiesgo(idx, now, 30);
  if (conTarjeta.length === 0) return null;

  const total = redondear2(conTarjeta.reduce((acc, r) => acc + r.importe, 0));
  const diasVencidos = conTarjeta.map(r => Math.floor((now.getTime() - new Date(r.fechaVencimiento).getTime()) / MS_DIA));
  const diasMedioVencido = diasVencidos.reduce((a, b) => a + b, 0) / diasVencidos.length;

  const confianza = confianzaRecuperarPagos({ tarjetaValida: true, vencidoMenos30d: true, socioActivo: true });
  if (!confianza) return null;

  const motivoMotor = `Nada raro, cosas de tarjetas. Los tengo listos para reintentar — son ${total}€ que deberían estar en tu cuenta.`;

  return {
    especialista: 'INGRESOS',
    tipo: 'RECUPERAR_PAGOS',
    dedupeKey: `INGRESOS:RECUPERAR_PAGOS:${s.studioId}`,
    tituloMotor: `Se quedaron ${conTarjeta.length} pagos sin completar`,
    motivoMotor,
    datosUsados: { n: conTarjeta.length, total, diasMedioVencido: redondear1(diasMedioVencido) },
    riesgo: 'PERDIDA',
    impacto: { valor: total, unidad: 'EUR', formula: `${conTarjeta.length} recibos pendientes: ${total}€` },
    confianza,
    accion: { tipo: 'COBRAR_RECIBOS', reciboIds: conTarjeta.map(r => r.id) },
    tiempoEstimadoMin: 1,
    expiraEnDias: 7,
    urgencia: Math.min(1, 0.4 + 0.05 * diasMedioVencido),
    esfuerzo: 0.05,
  };
}

/**
 * I3 · Impago sin cobro automático → COBRAR_PENDIENTE (gestión manual). Una
 * candidata por socia (agrega sus recibos vencidos). Cubre el punto ciego de I2,
 * que solo actúa sobre socias con tarjeta guardada: sin Stripe configurado, ese
 * filtro dejaba TODOS los impagos invisibles. Aquí no hay reintento automático,
 * el propietario reclama a mano — por eso la acción es CONTACTO_MANUAL.
 */
const IMPORTE_MINIMO_RELEVANTE = 10;

function reglaI3(socioId: string, recibos: Recibo[], idx: IndicesSenal, now: Date): Candidata | null {
  if (recibos.length === 0) return null;
  const socio = idx.socioPorId.get(socioId);
  if (!socio) return null;

  const total = redondear2(recibos.reduce((acc, r) => acc + r.importe, 0));
  // Puerta dura: importes ínfimos son ruido, no una decisión que reclamar.
  if (total < IMPORTE_MINIMO_RELEVANTE) return null;

  const diasVencidos = recibos.map(r => Math.floor((now.getTime() - new Date(r.fechaVencimiento).getTime()) / MS_DIA));
  const diasMaxVencido = Math.max(...diasVencidos);

  const confianza = confianzaCobrarPendienteManual({
    socioActivo: socio.activo,
    vencidoSignificativo: diasMaxVencido >= 15,
  });
  if (!confianza) return null;

  const motivoMotor = recibos.length === 1
    ? `Tiene un recibo de ${total}€ sin pagar desde hace ${diasMaxVencido} días y no hay tarjeta para reintentarlo. Habría que reclamárselo directamente.`
    : `Acumula ${recibos.length} recibos sin pagar (${total}€ en total) y no hay tarjeta guardada para cobrarlos solos. Toca reclamarle a mano.`;

  return {
    especialista: 'INGRESOS',
    tipo: 'COBRAR_PENDIENTE',
    dedupeKey: `INGRESOS:COBRAR_PENDIENTE:${socioId}`,
    tituloMotor: `${socio.nombre} tiene ${total}€ pendientes de pago`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, nRecibos: recibos.length, total, diasMaxVencido },
    riesgo: 'PERDIDA',
    impacto: { valor: total, unidad: 'EUR', formula: `${recibos.length} recibo(s) sin cobro automático: ${total}€` },
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia: Math.min(1, 0.4 + 0.02 * diasMaxVencido),
    esfuerzo: 0.3,
  };
}

export const ingresos: Especialista = {
  id: 'INGRESOS',
  pregunta: '¿Dónde estamos dejando dinero?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];

    const franjas = agruparFranjasRecurrentes(idx, s, now, 3);
    for (const [clave, franja] of franjas) {
      const c = reglaI1(clave, franja, s, idx);
      if (c) candidatas.push(c);
    }

    const i2 = reglaI2(s, idx, now);
    if (i2) candidatas.push(i2);

    for (const [socioId, recibos] of impagosManualesPorSocio(idx, now, 90)) {
      const c = reglaI3(socioId, recibos, idx, now);
      if (c) candidatas.push(c);
    }

    return candidatas;
  },
};
