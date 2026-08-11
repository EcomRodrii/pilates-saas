// Especialista en Agenda — ¿qué clases sobran o faltan en el horario? (MVP: A1).
// Cubre el punto ciego de Ingresos, que solo detecta clases que se LLENAN (I1):
// aquí detectamos las que van medio vacías semana tras semana — el propietario
// paga sala e instructora para dos personas y nadie se lo estaba diciendo.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Sesion } from '@/lib/types';
import {
  construirIndices, agruparFranjasRecurrentes, hayProximaSesionEnFranja, precioMedioSesion,
  variacionOcupacionFranja, claveFranjaDe, pronosticarFranja, candidatasPorAfinidad, franjaLocalDe,
  type IndicesSenal, type FranjaRecurrente,
} from '../senales.ts';
import {
  confianzaSesionInfrautilizada, confianzaOcupacionBajaEstructural, confianzaMoverHorario,
  confianzaLlenarPlazas, confianzaCubrirClaseEnRiesgo,
} from '../confianza.ts';
import { estimarProbabilidad, tasaBase, nivelPrediccion } from '../prediccion.ts';
import { TZ_ESTUDIO } from '../../utils.ts';

const MS_DIA = 86400000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;
const redondear1 = (n: number) => Math.round(n * 10) / 10;

const UMBRAL_VACIA = 0.30;      // ocupación por debajo de la cual la franja "va vacía"
const OCURRENCIAS_MINIMAS = 3;  // nº de ocurrencias recientes que deben ir vacías
const A3_UMBRAL_LLENA = 0.70;   // otra franja del mismo tipo por encima de esto → "se llena"

// A2 (ocupación estructuralmente baja): parámetros de la agregación.
const A2_DIAS = 28;             // ventana de clases pasadas a evaluar
const A2_MIN_CLASES = 8;        // por debajo de esto es un estudio recién arrancado
const A2_MIN_VACIAS = 6;        // nº de clases casi vacías para que valga la pena avisar
const A2_PROPORCION_ALTA = 0.4; // fracción de clases casi vacías que sube la confianza

/**
 * Día de la semana + hora de una franja, en formato legible (es-ES) y en la
 * hora LOCAL del estudio. Iba en UTC: en horario de verano español una clase
 * de las 20:00 se le presentaba a la propietaria como "tu clase de las 18:00",
 * que es una hora a la que no tiene ninguna clase. Ver franjaLocalDe (senales.ts).
 */
function etiquetaFranja(referencia: FranjaRecurrente['sesionesOrdenadas'][number]): { diaSemana: string; hora: string } {
  const inicio = new Date(referencia.inicio);
  return {
    diaSemana: inicio.toLocaleDateString('es-ES', { weekday: 'long', timeZone: TZ_ESTUDIO }),
    hora: inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO }),
  };
}

/** Media de ocupación de las últimas `n` ocurrencias de una franja. */
function ocupacionMediaUltimas(franja: FranjaRecurrente, n: number): number {
  const u = franja.ocupaciones.slice(0, n);
  return u.length === 0 ? 0 : u.reduce((a, b) => a + b, 0) / u.length;
}

// Umbral de magnitud: por debajo de esto es indistinguible del ruido de
// muestra pequeña (aforo típico de Pilates ~8-12, así que una sola persona de
// diferencia entre semanas ya mueve la media un 8-10%).
const TENDENCIA_CAIDA_MINIMA = 0.10;

/**
 * Frase opcional con el % de caída de ocupación, solo cuando el propio motor
 * ya confía lo bastante (patrón sostenido ≥5 semanas — el mismo umbral que
 * sube la confianza a ALTA en confianza.ts) y la caída supera el ruido de
 * muestra pequeña. Vacía en caso contrario: el texto principal (ocupación
 * media de hoy) es siempre calculable con solo 3 ocurrencias, esto solo lo
 * complementa cuando hay más certeza — nunca lo sustituye.
 */
function fraseTendencia(franja: FranjaRecurrente, ocurrenciasVacias: number): string {
  if (ocurrenciasVacias < 5) return '';
  const variacion = variacionOcupacionFranja(franja, OCURRENCIAS_MINIMAS);
  if (!variacion || variacion.pctVariacion > -TENDENCIA_CAIDA_MINIMA) return '';
  const pct = Math.abs(Math.round(variacion.pctVariacion * 100));
  return ` La ocupación cayó un ${pct}% respecto a las ${OCURRENCIAS_MINIMAS} semanas anteriores.`;
}

/**
 * A3 · Franja medio vacía pero el MISMO tipo de clase se llena en otra hora →
 * MOVER_HORARIO. Distinto de A1/A2 (fusionar/eliminar): aquí la demanda EXISTE,
 * solo que no a esa hora. Es mutuamente excluyente con A1 por franja (ver
 * detectar): si hay un horario alternativo que funciona, mover gana a fusionar.
 */
function reglaA3(clave: string, franja: FranjaRecurrente, franjas: Map<string, FranjaRecurrente>, s: SnapshotEstudio, idx: IndicesSenal, now: Date): Candidata | null {
  if (franja.sesionesOrdenadas.length < OCURRENCIAS_MINIMAS) return null;
  const ultimas3 = franja.ocupaciones.slice(0, OCURRENCIAS_MINIMAS);
  if (!ultimas3.every(o => o <= UMBRAL_VACIA)) return null;
  if (!hayProximaSesionEnFranja(clave, s, now)) return null;

  let ocurrenciasVaciasA3 = 0;
  for (const o of franja.ocupaciones) {
    if (o <= UMBRAL_VACIA) ocurrenciasVaciasA3++;
    else break;
  }

  const referencia = franja.sesionesOrdenadas[0];
  const tipoClaseId = referencia.tipoClaseId;

  // Busca la franja MÁS llena del mismo tipo (distinta de esta) que vaya claramente llena.
  let alternativa: { franja: FranjaRecurrente; media: number } | null = null;
  for (const [otraClave, otra] of franjas) {
    if (otraClave === clave) continue;
    if (otra.sesionesOrdenadas[0]?.tipoClaseId !== tipoClaseId) continue;
    if (otra.sesionesOrdenadas.length < OCURRENCIAS_MINIMAS) continue;
    const media = ocupacionMediaUltimas(otra, OCURRENCIAS_MINIMAS);
    if (media < A3_UMBRAL_LLENA) continue;
    if (!alternativa || media > alternativa.media) alternativa = { franja: otra, media };
  }
  if (!alternativa) return null;

  const confianza = confianzaMoverHorario({ franjaVaciaConsistente: true, existeAlternativaLlena: true });
  if (!confianza) return null;

  const tipo = idx.tipoClasePorId.get(tipoClaseId);
  const aqui = etiquetaFranja(referencia);
  const alli = etiquetaFranja(alternativa.franja.sesionesOrdenadas[0]);

  const ocupacionMedia = ultimas3.reduce((a, b) => a + b, 0) / ultimas3.length;
  const plazasVacias = Math.max(0, referencia.aforoMaximo - Math.round(ocupacionMedia * referencia.aforoMaximo));
  const precioMedio = precioMedioSesion(s, idx);
  const valor = redondear2(plazasVacias * precioMedio * 4.33);

  const motivoMotor = `Tu ${tipo?.nombre ?? 'clase'} del ${aqui.diaSemana} a las ${aqui.hora} va medio vacía, pero la del ${alli.diaSemana} a las ${alli.hora} se llena (${Math.round(alternativa.media * 100)}%).${fraseTendencia(franja, ocurrenciasVaciasA3)} La demanda está ahí — a lo mejor el problema es la hora, no la clase. Probaría a moverla a una franja parecida a la que sí funciona.`;

  return {
    especialista: 'AGENDA',
    tipo: 'MOVER_HORARIO',
    dedupeKey: `AGENDA:MOVER_HORARIO:${clave}`,
    tituloMotor: `Tu clase del ${aqui.diaSemana} a las ${aqui.hora} quizá esté a mala hora`,
    motivoMotor,
    datosUsados: {
      tipoClase: tipo?.nombre ?? 'clase', diaVacio: aqui.diaSemana, horaVacia: aqui.hora,
      diaLleno: alli.diaSemana, horaLlena: alli.hora, ocupacionAlternativaPct: Math.round(alternativa.media * 100),
    },
    riesgo: 'OPORTUNIDAD',
    impacto: valor > 0
      ? { valor, unidad: 'EUR_MES', formula: `${plazasVacias} plazas vacías × ${redondear2(precioMedio)}€/sesión × 4.33 semanas` }
      : undefined,
    confianza,
    accion: { tipo: 'MARCAR_GESTIONADO' },
    sesionId: referencia.id,
    instructorId: referencia.instructorId,
    tipoClaseId: referencia.tipoClaseId,
    salaId: referencia.salaId,
    tiempoEstimadoMin: 10,
    expiraEnDias: 21,
    urgencia: 0.4,
    esfuerzo: 0.6,
  };
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
  // Misma etiqueta que A3 — un solo sitio que decide cómo se nombra una franja.
  const { diaSemana, hora } = etiquetaFranja(referencia);

  const ocupacionMedia = ultimas3.reduce((a, b) => a + b, 0) / ultimas3.length;
  const asistentesMedios = redondear1(ocupacionMedia * referencia.aforoMaximo);
  const plazasVacias = Math.max(0, referencia.aforoMaximo - Math.round(asistentesMedios));
  const precioMedio = precioMedioSesion(s, idx);
  // Coste de oportunidad mensual de las plazas que quedan sin vender en la franja.
  const valor = redondear2(plazasVacias * precioMedio * 4.33);

  const motivoMotor = `Lleva ${ocurrenciasVacias} semanas con una media de ${asistentesMedios} personas (de ${referencia.aforoMaximo} plazas).${fraseTendencia(franja, ocurrenciasVacias)} O la promocionamos o la fusionamos con otra — así no pagas sala e instructora para media clase.`;

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
    instructorId: referencia.instructorId,
    tipoClaseId: referencia.tipoClaseId,
    salaId: referencia.salaId,
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

// ── A4 · Pronóstico de llenado (Fase 2 del Brain) ───────────────────────────
// A1/A2/A3 son forenses: hablan de franjas que YA fueron mal, cuando la clase
// de la que se aprendió ya se dio medio vacía. A4 es la primera regla del
// motor que habla de una clase que TODAVÍA NO HA PASADO y sobre la que aún se
// puede hacer algo.

const A4_DIAS_MIN = 1;          // a menos de un día no da tiempo a llenar nada
const A4_DIAS_MAX = 14;
const A4_MIN_OCURRENCIAS = 3;   // mismo suelo que A1/A3
const A4_CURVA_FIABLE = 5;      // a partir de aquí la curva se considera sólida
const A4_MARGEN_RETRASO = 0.7;  // "va por detrás" = por debajo del 70% de lo habitual
const A4_MIN_PLAZAS_LIBRES = 2; // por 1 plaza no se molesta a nadie
const A4_MAX_CANDIDATAS = 3;    // como mucho 3 clases avisadas por pasada

/**
 * Una sesión futura que va por detrás de la costumbre de su franja y que, al
 * ritmo habitual de reservas, se va a quedar con plazas libres.
 */
function reglaA4(
  futura: Sesion, franja: FranjaRecurrente, s: SnapshotEstudio, idx: IndicesSenal, now: Date,
): (Candidata & { _deficit: number }) | null {
  const p = pronosticarFranja(futura, franja, idx, now);
  if (!p) return null;
  if (p.diasVista < A4_DIAS_MIN || p.diasVista > A4_DIAS_MAX) return null;
  if (p.nOcurrencias < A4_MIN_OCURRENCIAS) return null;

  const plazasLibresPrevistas = Math.max(0, p.aforo - p.ocupacionPrevista);
  if (plazasLibresPrevistas < A4_MIN_PLAZAS_LIBRES) return null;

  // El hecho que dispara: va por debajo de lo que esta franja suele llevar a
  // estos mismos días vista. Sin referencia (la franja nunca tiene reservas a
  // estas alturas) no hay retraso que declarar.
  if (p.referenciaHabitual <= 0) return null;
  const porDetras = p.reservasAhora < p.referenciaHabitual * A4_MARGEN_RETRASO;
  if (!porDetras) return null;

  const candidatas = candidatasPorAfinidad(futura, s, idx, now);
  const confianza = confianzaLlenarPlazas({
    porDetrasDeLoHabitual: true,
    hayCandidatasCompatibles: candidatas.length > 0,
    curvaFiable: p.nOcurrencias >= A4_CURVA_FIABLE,
  });
  if (!confianza) return null;

  // Probabilidad de que acabe llenándose, con la muestra de la propia franja y
  // el prior del estudio. Devuelve null si no hay muestra — y entonces
  // sencillamente no se habla de probabilidad (ver prediccion.ts).
  const sesionesConAforo = s.sesiones.filter(x => !x.cancelada && x.aforoMaximo > 0 && new Date(x.inicio) < now);
  const prior = tasaBase(
    sesionesConAforo.filter(x => (idx.ocupadasPorSesion.get(x.id) ?? 0) / x.aforoMaximo >= 0.9).length,
    sesionesConAforo.length,
  );
  const prediccion = prior === null ? null : estimarProbabilidad({
    exitos: p.nSeLlenaron,
    total: p.nOcurrencias,
    prior,
    base: `esta franja se llenó ${p.nSeLlenaron} de las últimas ${p.nOcurrencias} veces`,
  });

  const { diaSemana, hora } = etiquetaFranja(futura);
  const dias = Math.round(p.diasVista);
  const precioMedio = precioMedioSesion(s, idx);
  const valor = redondear2(plazasLibresPrevistas * precioMedio);

  const frasePronostico = prediccion
    ? ` Probabilidad de que se llene: ${nivelPrediccion(prediccion.probabilidad).toLowerCase()} (${prediccion.base}).`
    : '';
  const fraseCandidatas = candidatas.length > 0
    ? ` Tengo ${candidatas.length} ${candidatas.length === 1 ? 'alumna compatible' : 'alumnas compatibles'} a las que ofrecérsela — la primera, ${candidatas[0].nombre}, ${candidatas[0].motivo}.`
    : ' No encuentro alumnas compatibles con plan en vigor a las que ofrecérsela, así que aquí toca promoción, no avisos.';

  const motivoMotor = `Lleva ${p.reservasAhora} de ${p.aforo} plazas a ${dias} ${dias === 1 ? 'día' : 'días'} vista, cuando a estas alturas suele llevar ${redondear1(p.referenciaHabitual)}. Al ritmo normal acabaría sobre ${redondear1(p.ocupacionPrevista)}, así que se quedarían ${plazasLibresPrevistas} plazas sin vender.${frasePronostico}${fraseCandidatas}`;

  return {
    especialista: 'AGENDA',
    tipo: 'LLENAR_PLAZAS',
    // Por SESIÓN, no por franja: dos martes distintos son dos avisos distintos,
    // y cada uno caduca con su clase.
    dedupeKey: `AGENDA:LLENAR_PLAZAS:${futura.id}`,
    tituloMotor: `Tu clase del ${diaSemana} a las ${hora} va floja de reservas`,
    motivoMotor,
    datosUsados: {
      diaSemana, hora, diasVista: dias,
      reservasAhora: p.reservasAhora, aforo: p.aforo,
      referenciaHabitual: redondear1(p.referenciaHabitual),
      ocupacionPrevista: redondear1(p.ocupacionPrevista),
      plazasLibresPrevistas,
      candidatasCompatibles: candidatas.length,
      ocurrenciasComparadas: p.nOcurrencias,
    },
    riesgo: 'OPORTUNIDAD',
    impacto: valor > 0
      ? { valor, unidad: 'EUR', formula: `${plazasLibresPrevistas} plazas previstas sin vender × ${redondear2(precioMedio)}€/sesión` }
      : undefined,
    confianza,
    ...(prediccion ? { prediccion } : {}),
    // Deliberadamente MARCAR_GESTIONADO y no un envío masivo: avisar de golpe a
    // 20 socias es una acción con cara visible hacia fuera, y no se activa sin
    // pedirlo expresamente. El panel ya ofrece contactar de una en una.
    accion: { tipo: 'MARCAR_GESTIONADO' },
    sesionId: futura.id,
    instructorId: futura.instructorId,
    tipoClaseId: futura.tipoClaseId,
    salaId: futura.salaId,
    tiempoEstimadoMin: 10,
    // Caduca con la clase: pasada la fecha, la recomendación ya no sirve de nada.
    expiraEnDias: Math.max(1, Math.ceil(p.diasVista)),
    urgencia: Math.min(0.9, 0.5 + (A4_DIAS_MAX - p.diasVista) / (A4_DIAS_MAX * 2)),
    esfuerzo: 0.4,
    _deficit: p.referenciaHabitual - p.reservasAhora,
  };
}

// ── A5 · Clase futura sin quien la dé (Fase 2 del Brain) ────────────────────
//
// El hueco que cierra: cuando una instructora graba vacaciones o una baja, sus
// clases YA PROGRAMADAS siguen asignadas a ella y NADIE se entera. Todo el
// código que hoy mira las ausencias (`ausenciaEnFecha`) lo hace al ASIGNAR —
// desplegables, filtros, diálogo de cobertura — así que solo protege contra
// asignar mal a futuro, no contra un bloqueo grabado DESPUÉS de programar el
// horario.
//
// ⚠️ Esto NO reabre la decisión de producto de #558 ("confirmar una ausencia no
// dispara ninguna sustitución automática sobre sus clases ya programadas"). No
// dispara nada: se lo cuenta a la propietaria para que decida ella, que es
// justo lo que faltaba.

const A5_DIAS_MAX = 30; // más allá, la propietaria todavía tiene margen de sobra

/** ¿El bloqueo pisa a la sesión? Sin horas = el día entero. */
function bloqueoPisaSesion(b: SnapshotEstudio['bloqueosAgenda'][number], inicio: Date, fin: Date): boolean {
  if (!b.horaInicio || !b.horaFin) return true;
  const hhmm = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };
  const { hora: hIni, minuto: mIni } = franjaLocalDe(inicio.toISOString());
  const { hora: hFin, minuto: mFin } = franjaLocalDe(fin.toISOString());
  const sesIni = hIni * 60 + mIni;
  const sesFin = hFin * 60 + mFin;
  return hhmm(b.horaInicio) < sesFin && hhmm(b.horaFin) > sesIni;
}

/** Día local del estudio en YYYY-MM-DD (las excepciones se guardan por día). */
function diaLocalDe(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ_ESTUDIO });
}

function reglaA5(s: SnapshotEstudio, idx: IndicesSenal, now: Date): Candidata[] {
  const t = now.getTime();
  const limite = t + A5_DIAS_MAX * MS_DIA;
  const instructorPorId = new Map(s.instructores.map(i => [i.id, i]));
  const candidatas: Candidata[] = [];

  const futuras = s.sesiones.filter(se => {
    if (se.cancelada) return false;
    const inicio = new Date(se.inicio).getTime();
    return inicio > t && inicio <= limite;
  });

  for (const se of futuras) {
    const inicio = new Date(se.inicio);
    const fin = new Date(se.fin ?? se.inicio);
    const dia = diaLocalDe(se.inicio);

    const bloqueo = s.bloqueosAgenda.find(b =>
      b.instructorId === se.instructorId && b.fecha === dia && bloqueoPisaSesion(b, inicio, fin));

    // Doble asignación: la misma instructora en dos clases que se pisan.
    const solapada = !bloqueo ? futuras.find(otra =>
      otra.id !== se.id && otra.instructorId === se.instructorId &&
      new Date(otra.inicio).getTime() < fin.getTime() &&
      new Date(otra.fin ?? otra.inicio).getTime() > inicio.getTime()) : undefined;

    if (!bloqueo && !solapada) continue;
    const confianza = confianzaCubrirClaseEnRiesgo({ choqueConfirmado: true });
    if (!confianza) continue;

    const ins = instructorPorId.get(se.instructorId);
    const nombre = ins?.nombre ?? 'La instructora';
    const tipo = idx.tipoClasePorId.get(se.tipoClaseId);
    const { diaSemana, hora } = etiquetaFranja(se);
    const reservas = idx.ocupadasPorSesion.get(se.id) ?? 0;

    const motivoMotor = bloqueo
      ? `${nombre} tiene marcado que no está disponible el ${diaSemana} ${dia}, y esa clase sigue asignada a ella. ${reservas === 0 ? 'Todavía no hay nadie apuntado' : reservas === 1 ? 'Ya hay 1 alumna apuntada' : `Ya hay ${reservas} alumnas apuntadas`}. Marcar la baja desde el panel de sustituciones te busca sustituta sola.`
      : `${nombre} está asignada a dos clases que se pisan el ${diaSemana} a las ${hora}. Una de las dos se va a quedar sin quien la dé.`;

    candidatas.push({
      especialista: 'AGENDA',
      tipo: 'CUBRIR_CLASE_EN_RIESGO',
      dedupeKey: `AGENDA:CUBRIR_CLASE_EN_RIESGO:${se.id}`,
      tituloMotor: bloqueo
        ? `${nombre} no puede dar su clase del ${diaSemana}`
        : `${nombre} tiene dos clases a la vez el ${diaSemana}`,
      motivoMotor,
      datosUsados: {
        instructora: nombre, diaSemana, hora, fecha: dia,
        tipoClase: tipo?.nombre ?? 'clase', reservas,
        motivo: bloqueo ? 'ausencia' : 'solape',
      },
      riesgo: 'PERDIDA',
      confianza,
      accion: { tipo: 'MARCAR_GESTIONADO' },
      sesionId: se.id,
      instructorId: se.instructorId,
      tipoClaseId: se.tipoClaseId,
      salaId: se.salaId,
      tiempoEstimadoMin: 5,
      expiraEnDias: Math.max(1, Math.ceil((new Date(se.inicio).getTime() - t) / MS_DIA)),
      // Cuanto más cerca la clase, más urgente: a 30 días 0.5, el día antes ~1.
      urgencia: Math.min(1, 0.5 + (A5_DIAS_MAX - (new Date(se.inicio).getTime() - t) / MS_DIA) / (A5_DIAS_MAX * 2)),
      esfuerzo: 0.3,
    });
  }
  return candidatas;
}

export const agenda: Especialista = {
  id: 'AGENDA',
  pregunta: '¿Qué clases sobran o faltan en el horario?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    const franjas = agruparFranjasRecurrentes(idx, s, now, OCURRENCIAS_MINIMAS);
    for (const [clave, franja] of franjas) {
      // A3 (mover) antes que A1 (fusionar): si el mismo tipo de clase se llena en
      // otra hora, la demanda existe y mover gana a fusionar. Solo si no, fusionar.
      const cMover = reglaA3(clave, franja, franjas, s, idx, now);
      if (cMover) { candidatas.push(cMover); continue; }
      const c = reglaA1(clave, franja, s, idx, now);
      if (c) candidatas.push(c);
    }
    // A2 solo si A1 no encontró franjas recurrentes vacías concretas: si ya hay
    // consejo específico por franja, el agregado a nivel de estudio sería redundante.
    if (candidatas.length === 0) {
      const c = reglaA2(s, idx, now);
      if (c) candidatas.push(c);
    }

    // A4 · pronóstico por sesión futura. Se recorren TODAS las clases de las
    // próximas dos semanas, pero solo salen las 3 peores: sin ese tope, un
    // estudio con 40 clases a la semana podría generar decenas de candidatas
    // del mismo tipo y ahogar todo lo demás en el Centro de Control.
    const futuras: (Candidata & { _deficit: number })[] = [];
    for (const se of s.sesiones) {
      if (se.cancelada) continue;
      if (new Date(se.inicio).getTime() <= now.getTime()) continue;
      const franja = franjas.get(claveFranjaDe(se));
      if (!franja) continue; // sin historial de su franja no hay con qué comparar
      const c = reglaA4(se, franja, s, idx, now);
      if (c) futuras.push(c);
    }
    // A5 · clases futuras que se quedan sin quien las dé. Va aparte del tope de
    // A4: no es una oportunidad comercial que se pueda posponer, es una clase
    // que no se va a poder dar.
    candidatas.push(...reglaA5(s, idx, now));

    futuras.sort((a, b) => b._deficit - a._deficit);
    for (const c of futuras.slice(0, A4_MAX_CANDIDATAS)) {
      const { _deficit, ...candidata } = c;
      void _deficit;
      candidatas.push(candidata);
    }

    return candidatas;
  },
};
