// Especialista en Agenda — ¿qué clases sobran o faltan en el horario? (MVP: A1).
// Cubre el punto ciego de Ingresos, que solo detecta clases que se LLENAN (I1):
// aquí detectamos las que van medio vacías semana tras semana — el propietario
// paga sala e instructora para dos personas y nadie se lo estaba diciendo.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import {
  construirIndices, agruparFranjasRecurrentes, frecuenciaHabitual, hayProximaSesionEnFranja,
  type IndicesSenal, type FranjaRecurrente,
} from '../senales.ts';
import { confianzaSesionInfrautilizada, confianzaOcupacionBajaEstructural } from '../confianza.ts';

const MS_DIA = 86400000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;

const UMBRAL_VACIA = 0.30;      // ocupación por debajo de la cual la franja "va vacía"
const OCURRENCIAS_MINIMAS = 3;  // nº de ocurrencias recientes que deben ir vacías

// A2 (ocupación estructuralmente baja): parámetros de la agregación.
const A2_DIAS = 28;             // ventana de clases pasadas a evaluar
const A2_MIN_CLASES = 8;        // por debajo de esto es un estudio recién arrancado
const A2_MIN_VACIAS = 6;        // nº de clases casi vacías para que valga la pena avisar
const A2_PROPORCION_ALTA = 0.4; // fracción de clases casi vacías que sube la confianza

/**
 * Precio medio por sesión, ponderado por socias activas (mismo criterio que
 * Ingresos §2.2). Se usa para valorar las plazas vacías que se están dejando sin
 * vender en la franja infrautilizada.
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

/** A1 · Franja recurrente medio vacía y todavía viva → FUSIONAR_SESIONES. */
function reglaA1(clave: string, franja: FranjaRecurrente, s: SnapshotEstudio, idx: IndicesSenal, now: Date): Candidata | null {
  if (franja.sesionesOrdenadas.length < OCURRENCIAS_MINIMAS) return null;

  const ultimas3 = franja.ocupaciones.slice(0, OCURRENCIAS_MINIMAS);
  const vaciaConsistente = ultimas3.every(o => o <= UMBRAL_VACIA);
  if (!vaciaConsistente) return null;

  // Solo tiene sentido avisar si la franja sigue programándose (hay clase futura).
  if (!hayProximaSesionEnFranja(clave, s, now)) return null;

  let ocurrenciasVacias = 0;
  for (const o of franja.ocupaciones) {
    if (o <= UMBRAL_VACIA) ocurrenciasVacias++;
    else break;
  }

  const confianza = confianzaSesionInfrautilizada({
    ocupacionBajaConsistente: vaciaConsistente,
    patronSostenido: ocurrenciasVacias >= 5,
  });
  if (!confianza) return null;

  const referencia = franja.sesionesOrdenadas[0];
  const tipo = idx.tipoClasePorId.get(referencia.tipoClaseId);
  const inicioRef = new Date(referencia.inicio);
  const diaSemana = inicioRef.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'UTC' });
  const hora = inicioRef.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  const ocupacionMedia = ultimas3.reduce((a, b) => a + b, 0) / ultimas3.length;
  const asistentesMedios = redondear1(ocupacionMedia * referencia.aforoMaximo);
  const plazasVacias = Math.max(0, referencia.aforoMaximo - Math.round(asistentesMedios));
  const precioMedio = precioMedioSesion(s, idx);
  // Coste de oportunidad mensual de las plazas que quedan sin vender en la franja.
  const valor = redondear2(plazasVacias * precioMedio * 4.33);

  const motivoMotor = `Lleva ${ocurrenciasVacias} semanas con una media de ${asistentesMedios} personas (de ${referencia.aforoMaximo} plazas). O la promocionamos o la fusionamos con otra — así no pagas sala e instructora para media clase.`;

  return {
    especialista: 'AGENDA',
    tipo: 'FUSIONAR_SESIONES',
    dedupeKey: `AGENDA:FUSIONAR_SESIONES:${clave}`,
    tituloMotor: `Tu clase del ${diaSemana} a las ${hora} va medio vacía`,
    motivoMotor,
    datosUsados: {
      tipoClase: tipo?.nombre ?? 'clase', diaSemana, hora, semanasVacias: ocurrenciasVacias,
      ocupacionMediaPct: Math.round(ocupacionMedia * 100), asistentesMedios, aforo: referencia.aforoMaximo,
    },
    riesgo: 'OPORTUNIDAD',
    impacto: valor > 0
      ? { valor, unidad: 'EUR_MES', formula: `${plazasVacias} plazas vacías × ${redondear2(precioMedio)}€/sesión × 4.33 semanas` }
      : undefined,
    confianza,
    accion: { tipo: 'MARCAR_GESTIONADO' },
    sesionId: referencia.id,
    tiempoEstimadoMin: 10,
    expiraEnDias: 21,
    urgencia: Math.min(0.8, 0.4 + 0.05 * ocurrenciasVacias),
    esfuerzo: 0.6,
  };
}

/**
 * A2 · Ocupación estructuralmente baja → FUSIONAR_SESIONES (a nivel de estudio).
 * Cubre el punto ciego de A1: A1 solo ve una FRANJA recurrente (mismo día/hora/
 * tipo ≥3 veces) que va vacía. Un estudio que programa clases ad-hoc —horarios
 * distintos cada semana— puede tener la mitad de sus clases casi vacías sin que
 * ninguna franja recurrente lo dispare. Aquí se agrega sobre TODAS las clases
 * pasadas recientes: si la mayoría van casi vacías, hay un problema de horario/
 * demanda que cuesta dinero (sala + instructora para clases que nadie usa).
 */
function reglaA2(s: SnapshotEstudio, idx: IndicesSenal, now: Date): Candidata | null {
  const desde = now.getTime() - A2_DIAS * MS_DIA;
  const pasadas = s.sesiones.filter(se => {
    if (se.cancelada || se.aforoMaximo <= 0) return false;
    const t = new Date(se.inicio).getTime();
    return t <= now.getTime() && t >= desde;
  });
  if (pasadas.length < A2_MIN_CLASES) return null;

  const vacias = pasadas.filter(se => (idx.ocupadasPorSesion.get(se.id) ?? 0) / se.aforoMaximo <= UMBRAL_VACIA);
  const nVacias = vacias.length;
  const bastantesVacias = nVacias >= A2_MIN_VACIAS;
  const proporcionAlta = nVacias / pasadas.length >= A2_PROPORCION_ALTA;

  const confianza = confianzaOcupacionBajaEstructural({ bastantesVacias, proporcionAlta });
  if (!confianza) return null;

  const ocupMediaPct = Math.round((pasadas.reduce((a, se) => a + (idx.ocupadasPorSesion.get(se.id) ?? 0) / se.aforoMaximo, 0) / pasadas.length) * 100);
  const precioMedio = precioMedioSesion(s, idx);
  // Impacto: SOLO las plazas vacías DE LAS CLASES CASI VACÍAS (no las de las que
  // van razonablemente llenas), llevado a ritmo mensual. Evita cifras infladas.
  const plazasVaciasEnVacias = vacias.reduce((acc, se) => acc + Math.max(0, se.aforoMaximo - (idx.ocupadasPorSesion.get(se.id) ?? 0)), 0);
  const plazasVaciasPorSemana = plazasVaciasEnVacias / (A2_DIAS / 7);
  const valor = redondear2(plazasVaciasPorSemana * precioMedio * 4.33);

  const motivoMotor = `En las últimas ${A2_DIAS / 7} semanas, ${nVacias} de tus ${pasadas.length} clases fueron con la sala a menos del 30% de ocupación. Estás pagando sala e instructora para clases casi vacías — o reagrupas el horario en menos clases más llenas, o promocionas esas franjas.`;

  return {
    especialista: 'AGENDA',
    tipo: 'FUSIONAR_SESIONES',
    dedupeKey: `AGENDA:OCUPACION_BAJA:${s.studioId}`,
    tituloMotor: nVacias === 1 ? `1 clase va casi vacía semana tras semana` : `${nVacias} clases van casi vacías`,
    motivoMotor,
    datosUsados: { clasesEvaluadas: pasadas.length, clasesVacias: nVacias, ocupacionMediaPct: ocupMediaPct, semanas: A2_DIAS / 7 },
    riesgo: 'PERDIDA',
    impacto: valor > 0
      ? { valor, unidad: 'EUR_MES', formula: `${redondear1(plazasVaciasPorSemana)} plazas vacías/semana en ${nVacias} clases casi vacías × ${redondear2(precioMedio)}€ × 4.33` }
      : undefined,
    confianza,
    accion: { tipo: 'MARCAR_GESTIONADO' },
    tiempoEstimadoMin: 15,
    expiraEnDias: 21,
    urgencia: Math.min(0.7, 0.4 + 0.02 * nVacias),
    esfuerzo: 0.7,
  };
}

export const agenda: Especialista = {
  id: 'AGENDA',
  pregunta: '¿Qué clases sobran o faltan en el horario?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    const franjas = agruparFranjasRecurrentes(idx, s, now, OCURRENCIAS_MINIMAS);
    for (const [clave, franja] of franjas) {
      const c = reglaA1(clave, franja, s, idx, now);
      if (c) candidatas.push(c);
    }
    // A2 solo si A1 no encontró franjas recurrentes vacías concretas: si ya hay
    // consejo específico por franja, el agregado a nivel de estudio sería redundante.
    if (candidatas.length === 0) {
      const c = reglaA2(s, idx, now);
      if (c) candidatas.push(c);
    }
    return candidatas;
  },
};
