// Especialista en Retención — ¿quién corre riesgo de abandonar? (MVP: R1-R4;
// R5 estacional diferida a Fase E, requiere ventana de 13 meses que el
// snapshot no tiene — DECISION-OS-ESPECIALISTAS.md R5, DECISION-OS-NUCLEO.md §1).
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Socio } from '@/lib/types';
import {
  construirIndices, frecuenciaHabitual, diasSinVenir, umbralAnomalo, ausenciaAnomala,
  renovacionProxima, valorMensual, diasDesdeUltimoContacto, emailsSinRespuesta, noShow30d,
  diasDesdeVencimientoSinRenovar, totalAsistencias,
  type IndicesSenal,
} from '../senales.ts';
import { confianzaRecuperarSocia, confianzaRecuperarSociaPorNoShow, confianzaEnviarReactivacion, confianzaRecuperarSociaVencida, confianzaCongelarMembresia } from '../confianza.ts';
import { tieneHechoActivo } from '../memoria.ts';

const MS_DIA = 86400000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** Elegibilidad global (Especialistas §1.1): activa, ≥30d de antigüedad, con
 * suscripción ACTIVA — si es BONO, con sesiones restantes. */
function esElegible(socio: Socio, idx: IndicesSenal, now: Date): boolean {
  if (!socio.activo) return false;
  const antiguedadDias = Math.floor((now.getTime() - new Date(socio.fechaAlta).getTime()) / MS_DIA);
  if (antiguedadDias < 30) return false;
  const sus = idx.suscripcionActivaPorSocio.get(socio.id);
  if (!sus) return false;
  const plan = idx.planPorId.get(sus.planId);
  if (plan?.tipo === 'BONO') return (sus.sesionesRestantes ?? 0) > 0;
  return true;
}

function frecuenciaUltimas4Semanas(socioId: string, idx: IndicesSenal, now: Date): number {
  const asistidas = idx.asistidasPorSocio.get(socioId) ?? [];
  const desde = now.getTime() - 28 * MS_DIA;
  return asistidas.filter(r => new Date(r.creadoEn).getTime() >= desde).length / 4;
}

/** R1 · Ausencia anómala temprana → RECUPERAR_SOCIA. */
function reglaR1(socio: Socio, idx: IndicesSenal, now: Date): Candidata | null {
  if (!ausenciaAnomala(socio.id, idx, now)) return null;
  const dias = diasSinVenir(socio.id, idx, now);
  if (dias === null) return null;
  const umbralA = umbralAnomalo(socio.id, idx);
  const umbralCritico = Math.max(28, 2 * umbralA);
  if (dias >= umbralCritico) return null;
  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  if (diasContacto !== null && diasContacto < 14) return null;

  const freq = frecuenciaHabitual(socio.id, idx);
  const renovProx = renovacionProxima(socio.id, idx, now);
  const valor = redondear2(valorMensual(socio.id, idx, now));
  const urgencia = Math.min(1, (dias - umbralA) / umbralA);

  const confianza = confianzaRecuperarSocia({
    ausenciaFrecuenciaValida: freq !== null,
    renovacionCerca: renovProx !== null && renovProx <= 14,
    sinContactoPrevio: diasContacto === null || diasContacto >= 30,
  });
  if (!confianza) return null;

  const motivoMotor = freq !== null
    ? `Venía ${redondear1(freq)}×/semana y lleva ${dias} días sin aparecer. Todavía estás a tiempo.`
    : `Lleva ${dias} días sin aparecer. Todavía estás a tiempo.`;

  return {
    especialista: 'RETENCION',
    tipo: 'RECUPERAR_SOCIA',
    dedupeKey: `RETENCION:RECUPERAR_SOCIA:${socio.id}`,
    tituloMotor: `Noto a ${socio.nombre} viniendo menos de lo habitual`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasSinVenir: dias, frecuenciaHabitual: freq ?? 0, valorMensual: valor },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `cuota mensual de ${socio.nombre} (${valor}€/mes) en riesgo` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 2,
    expiraEnDias: 10,
    urgencia,
    esfuerzo: 0.2,
  };
}

/** R2 · Riesgo crítico con renovación cerca → ENVIAR_REACTIVACION. */
function reglaR2(socio: Socio, idx: IndicesSenal, memoria: MemoriaEstudio, now: Date): Candidata | null {
  const dias = diasSinVenir(socio.id, idx, now);
  if (dias === null) return null;
  const umbralCritico = Math.max(28, 2 * umbralAnomalo(socio.id, idx));
  if (dias < umbralCritico) return null;
  const renovProx = renovacionProxima(socio.id, idx, now);
  if (renovProx === null || renovProx <= 0 || renovProx > 21) return null;
  const nSinRespuesta = emailsSinRespuesta(socio.id, idx, now);
  if (nSinRespuesta >= 3) return null;

  const descuentoPct = 15; // default; configurable por estudio en fases futuras
  const valor = redondear2(valorMensual(socio.id, idx, now));
  const urgencia = 1 - renovProx / 21;

  const confianza = confianzaEnviarReactivacion({
    ausenciaCritica: true,
    historicoRespuestaEmails: nSinRespuesta < 3,
    sinVetoDescuentos: !tieneHechoActivo(memoria, socio.id, 'NO_OFRECER_DESCUENTOS', now),
  });
  if (!confianza) return null;

  const motivoMotor = `Lleva ${dias} días sin venir y su renovación vence en ${renovProx} días. Puedo enviarle una oferta del ${descuentoPct}% — la apruebas tú.`;

  return {
    especialista: 'RETENCION',
    tipo: 'ENVIAR_REACTIVACION',
    dedupeKey: `RETENCION:ENVIAR_REACTIVACION:${socio.id}`,
    tituloMotor: `¿Le ofrecemos una vuelta con descuento a ${socio.nombre}?`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasSinVenir: dias, renovacionEnDias: renovProx, descuentoPct, valorMensual: valor },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `renovación de ${socio.nombre} (${valor}€/mes) vence en ${renovProx} días` } : undefined,
    confianza,
    accion: { tipo: 'ENVIAR_EMAIL', plantilla: 'REACTIVACION', descuentoPct },
    socioId: socio.id,
    tiempoEstimadoMin: 1,
    expiraEnDias: Math.max(1, Math.min(10, renovProx)),
    urgencia,
    esfuerzo: 0.1,
  };
}

/** R3 · Renovación inminente con enganche cayendo → CONTACTO_MANUAL (llamada). */
function reglaR3(socio: Socio, idx: IndicesSenal, now: Date): Candidata | null {
  const renovProx = renovacionProxima(socio.id, idx, now);
  if (renovProx === null || renovProx <= 0 || renovProx > 7) return null;
  const freq = frecuenciaHabitual(socio.id, idx);
  if (freq === null) return null;
  const freq4Sem = frecuenciaUltimas4Semanas(socio.id, idx, now);
  if (freq4Sem >= 0.5 * freq) return null;

  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  const confianza = confianzaRecuperarSocia({
    ausenciaFrecuenciaValida: true,
    renovacionCerca: true, // renovProx<=7 ⊆ criterio <=14
    sinContactoPrevio: diasContacto === null || diasContacto >= 30,
  });
  if (!confianza) return null;

  const valor = redondear2(valorMensual(socio.id, idx, now));
  const motivoMotor = `Renueva en ${renovProx} días y este mes ha venido la mitad de lo habitual. Una llamada a tiempo suele marcar la diferencia.`;

  return {
    especialista: 'RETENCION',
    tipo: 'RECUPERAR_SOCIA',
    dedupeKey: `RETENCION:RECUPERAR_SOCIA:${socio.id}`,
    tituloMotor: `Llamaría hoy a ${socio.nombre}`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, renovacionEnDias: renovProx,
      frecuenciaHabitual: redondear1(freq), frecuenciaUltimas4Semanas: redondear1(freq4Sem), valorMensual: valor,
    },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `renovación de ${socio.nombre} en ${renovProx} días` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'LLAMADA', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 5,
    expiraEnDias: Math.max(1, renovProx),
    urgencia: 1,
    esfuerzo: 0.4,
  };
}

/** R4 · Desenganche por no-shows → CONTACTO_MANUAL. */
function reglaR4(socio: Socio, idx: IndicesSenal, now: Date): Candidata | null {
  const { noShows, total, ratio } = noShow30d(socio.id, idx, now);
  if (noShows < 3 || ratio < 0.4) return null;

  const renovProx = renovacionProxima(socio.id, idx, now);
  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  const confianza = confianzaRecuperarSociaPorNoShow({
    patronNoShowClaro: true,
    renovacionCerca: renovProx !== null && renovProx <= 14,
    sinContactoPrevio: diasContacto === null || diasContacto >= 30,
  });
  if (!confianza) return null;

  const valor = redondear2(valorMensual(socio.id, idx, now));
  const motivoMotor = `Ha faltado a ${noShows} de sus últimas ${total} reservas. Algo pasa — yo le preguntaría.`;

  return {
    especialista: 'RETENCION',
    tipo: 'RECUPERAR_SOCIA',
    dedupeKey: `RETENCION:RECUPERAR_SOCIA:${socio.id}`,
    tituloMotor: `${socio.nombre} reserva pero no está viniendo`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, noShows, totalReservas: total, ratioNoShow: redondear2(ratio), valorMensual: valor },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `cuota de ${socio.nombre}; reserva pero no viene` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 2,
    expiraEnDias: 10,
    urgencia: 0.6,
    esfuerzo: 0.2,
  };
}

/**
 * R5 · Baja sin renovar → RECUPERAR_SOCIA. La socia sigue en la casa (activa) pero
 * su suscripción venció y no la renovó. R1-R4 no la ven porque `esElegible` exige
 * suscripción ACTIVA — justo el punto ciego que dejaba invisibles a las que se van.
 * Corre en la rama SIN suscripción activa (ver detectar).
 */
function reglaR5(socio: Socio, idx: IndicesSenal, now: Date): Candidata | null {
  if (!socio.activo) return null;
  const antiguedadDias = Math.floor((now.getTime() - new Date(socio.fechaAlta).getTime()) / MS_DIA);
  if (antiguedadDias < 30) return null;

  const diasVencida = diasDesdeVencimientoSinRenovar(socio.id, idx, now, 45);
  if (diasVencida === null) return null;

  // Solo reactivamos a quien llegó a engancharse; sin ninguna asistencia no hay
  // señal de que fuera una socia real (evita perseguir altas fantasma).
  const asistencias = totalAsistencias(socio.id, idx);
  if (asistencias < 1) return null;

  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  if (diasContacto !== null && diasContacto < 14) return null;

  const confianza = confianzaRecuperarSociaVencida({
    vencioReciente: diasVencida <= 30,
    sinContactoReciente: diasContacto === null || diasContacto >= 30,
  });
  if (!confianza) return null;

  const valor = redondear2(valorMensual(socio.id, idx, now));
  const urgencia = Math.min(1, 0.5 + (45 - diasVencida) / 90); // más fresca la baja, más urgente
  const motivoMotor = `Se le acabó la cuota hace ${diasVencida} días y no ha vuelto a renovar. Una llamada ahora, mientras aún se acuerda de lo bien que le sentaba, suele traerla de vuelta.`;

  return {
    especialista: 'RETENCION',
    tipo: 'RECUPERAR_SOCIA',
    dedupeKey: `RETENCION:RECUPERAR_SOCIA:${socio.id}`,
    tituloMotor: `${socio.nombre} dejó de renovar hace ${diasVencida} días`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasDesdeVencimiento: diasVencida, asistenciasPrevias: asistencias, valorMensual: valor },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `cuota de ${socio.nombre} (${valor}€/mes) perdida al no renovar` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia,
    esfuerzo: 0.3,
  };
}

/**
 * R6 · Paga pero no viene → CONGELAR_MEMBRESIA. Socia con MENSUAL vigente que
 * sigue cobrándosele cada mes pero lleva ≥45 días sin aparecer. R1-R4 no la ven:
 * R1 exige ausencia por DEBAJO del umbral crítico (esta lo supera), R2/R3 exigen
 * renovación inminente, R4 un patrón de no-shows. Aquí el hecho es distinto —
 * paga y no usa— y la palanca también: ofrecerle CONGELAR antes de que cancele
 * de golpe y con mal sabor. Por eso va la ÚLTIMA del `??` (solo si nada más aplica).
 */
function reglaR6(socio: Socio, idx: IndicesSenal, now: Date): Candidata | null {
  const sus = idx.suscripcionActivaPorSocio.get(socio.id);
  if (!sus) return null;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'MENSUAL') return null; // solo cuota recurrente; el bono lo cubre Finanzas

  const dias = diasSinVenir(socio.id, idx, now);
  if (dias === null || dias < 45) return null; // sin asistencias nunca, o ausencia aún no prolongada

  // Debe estar al corriente de pago: si tiene un recibo vencido, es un problema de
  // cobro (Ingresos), no un candidato a congelación de buena fe.
  const tieneImpago = idx.recibosPendientes.some(r => {
    if (r.socioId !== socio.id) return false;
    return new Date(r.fechaVencimiento).getTime() <= now.getTime();
  });
  if (tieneImpago) return null;

  const confianza = confianzaCongelarMembresia({ ausenciaProlongada: dias >= 45, ausenciaMuyProlongada: dias >= 60 });
  if (!confianza) return null;

  const valor = redondear2(valorMensual(socio.id, idx, now));
  const motivoMotor = `${socio.nombre} lleva ${dias} días sin venir pero se le sigue cobrando la mensualidad. Antes de que cancele de golpe, yo le ofrecería congelarla una temporada — así no pierde el dinero ni tú a la socia.`;

  return {
    especialista: 'RETENCION',
    tipo: 'CONGELAR_MEMBRESIA',
    dedupeKey: `RETENCION:CONGELAR_MEMBRESIA:${socio.id}`,
    tituloMotor: `${socio.nombre} paga pero no viene desde hace ${dias} días`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasSinVenir: dias, plan: plan.nombre, valorMensual: valor },
    riesgo: 'PERDIDA',
    impacto: valor > 0 ? { valor, unidad: 'EUR_MES', formula: `cuota de ${socio.nombre} (${valor}€/mes) en riesgo de cancelación` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia: Math.min(0.7, 0.4 + (dias - 45) / 100),
    esfuerzo: 0.3,
  };
}

export const retencion: Especialista = {
  id: 'RETENCION',
  pregunta: '¿Quién corre riesgo de abandonar?',
  detectar(s: SnapshotEstudio, m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const socio of s.socios) {
      // Rama sin suscripción ACTIVA: la socia que no renovó. Antes se descartaba
      // aquí y quedaba invisible; ahora R5 la recupera.
      if (!idx.suscripcionActivaPorSocio.has(socio.id)) {
        const c = reglaR5(socio, idx, now);
        if (c) candidatas.push(c);
        continue;
      }
      if (!esElegible(socio, idx, now)) continue;
      // Prioridad interna por socia (Especialistas §1.2): R3 > R2 > R1 > R4.
      // Solo una candidata sale por socia — el resto queda como contexto.
      const candidata =
        reglaR3(socio, idx, now) ??
        reglaR2(socio, idx, m, now) ??
        reglaR1(socio, idx, now) ??
        reglaR4(socio, idx, now) ??
        reglaR6(socio, idx, now);
      if (candidata) candidatas.push(candidata);
    }
    return candidatas;
  },
};
