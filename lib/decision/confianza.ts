// Confidence Engine (DECISION-OS-NUCLEO.md §5, DECISION-OS-ESPECIALISTAS.md).
// Cada tipo de recomendación tiene su propia tabla de criterios de evidencia →
// nivel. Por debajo del suelo de emisión (ni siquiera el criterio mínimo) la
// función devuelve null y la regla que la llama no genera candidata — el
// "menos de 70% nunca recomendar" de la Bible, sin inventar un porcentaje.
import type { Confianza, NivelConfianza, NivelAutonomia, TipoRecomendacion } from './tipos.ts';

function autonomiaDeNivel(nivel: NivelConfianza): NivelAutonomia {
  return nivel === 'ALTA' ? 2 : nivel === 'MEDIA' ? 1 : 0;
}

interface Criterio {
  valor: boolean;
  etiqueta: string;
}

function evaluarNivel(criterios: Criterio[], esAlta: boolean, esMedia: boolean, esBaja: boolean): Confianza | null {
  const evidencia = criterios.filter(c => c.valor).map(c => c.etiqueta);
  const nivel: NivelConfianza | null = esAlta ? 'ALTA' : esMedia ? 'MEDIA' : esBaja ? 'BAJA' : null;
  if (!nivel) return null;
  return { nivel, evidencia, autonomiaMaxima: autonomiaDeNivel(nivel) };
}

/** RECUPERAR_SOCIA — ALTA: a+b+d · MEDIA: a+d · BAJA: solo a. */
export function confianzaRecuperarSocia(c: {
  ausenciaFrecuenciaValida: boolean;
  renovacionCerca: boolean;
  sinContactoPrevio: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ausenciaFrecuenciaValida, etiqueta: 'ausencia anómala respecto a su frecuencia habitual' },
    { valor: c.renovacionCerca, etiqueta: 'renovación en menos de 14 días' },
    { valor: c.sinContactoPrevio, etiqueta: 'sin contacto en los últimos 30 días' },
  ];
  const { ausenciaFrecuenciaValida: a, renovacionCerca: b, sinContactoPrevio: d } = c;
  return evaluarNivel(criterios, a && b && d, a && d, a);
}

/**
 * RECUPERAR_SOCIA vía patrón de no-shows (Especialistas R4) — criterios propios:
 * "ausencia anómala" no aplica a una socia que reserva pero no aparece, así que
 * no reutiliza confianzaRecuperarSocia (su criterio 'a' sería estructuralmente
 * falso para esta población). Mismo shape ALTA: a+b+d · MEDIA: a+d · BAJA: solo a.
 */
export function confianzaRecuperarSociaPorNoShow(c: {
  patronNoShowClaro: boolean;
  renovacionCerca: boolean;
  sinContactoPrevio: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.patronNoShowClaro, etiqueta: 'patrón de no-shows por encima del umbral' },
    { valor: c.renovacionCerca, etiqueta: 'renovación en menos de 14 días' },
    { valor: c.sinContactoPrevio, etiqueta: 'sin contacto en los últimos 30 días' },
  ];
  const { patronNoShowClaro: a, renovacionCerca: b, sinContactoPrevio: d } = c;
  return evaluarNivel(criterios, a && b && d, a && d, a);
}

/** ENVIAR_REACTIVACION — ALTA: a+b+c · MEDIA: a+c · BAJA: solo a. */
export function confianzaEnviarReactivacion(c: {
  ausenciaCritica: boolean;
  historicoRespuestaEmails: boolean;
  sinVetoDescuentos: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ausenciaCritica, etiqueta: 'ausencia igual o superior al umbral crítico' },
    { valor: c.historicoRespuestaEmails, etiqueta: 'histórico de respuesta a emails' },
    { valor: c.sinVetoDescuentos, etiqueta: 'sin veto de memoria a descuentos' },
  ];
  const { ausenciaCritica: a, historicoRespuestaEmails: b, sinVetoDescuentos: cc } = c;
  return evaluarNivel(criterios, a && b && cc, a && cc, a);
}

/**
 * RECUPERAR_SOCIA vía baja sin renovar (Retención R5) — la socia ya no tiene
 * suscripción vigente. No aplica "ausencia anómala" (no hay suscripción de
 * referencia); el engagement previo se exige como puerta en la regla, no aquí.
 * ALTA: a+b (baja fresca y sin contactar) · MEDIA: solo a · BAJA: solo b.
 */
export function confianzaRecuperarSociaVencida(c: {
  vencioReciente: boolean;      // venció hace ≤30 días (ventana caliente de reactivación)
  sinContactoReciente: boolean; // sin contacto en los últimos 30 días
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.vencioReciente, etiqueta: 'suscripción vencida hace 30 días o menos' },
    { valor: c.sinContactoReciente, etiqueta: 'sin contacto en los últimos 30 días' },
  ];
  const { vencioReciente: a, sinContactoReciente: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

/**
 * COBRAR_PENDIENTE manual (Ingresos I3) — impago de una socia SIN tarjeta
 * guardada: no se puede reintentar en automático, hay que reclamar a mano. El
 * mínimo de importe y la existencia del impago se filtran como puerta en la
 * regla; aquí se gradúa por si la socia sigue activa y cuánto lleva vencido.
 * ALTA: a+b (activa y claramente vencido) · MEDIA: solo a · BAJA: solo b.
 */
export function confianzaCobrarPendienteManual(c: {
  socioActivo: boolean;        // la socia sigue activa (merece la pena reclamar)
  vencidoSignificativo: boolean; // vencido bastante (no un simple desfase de ciclo)
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.socioActivo, etiqueta: 'socia activa' },
    { valor: c.vencidoSignificativo, etiqueta: 'recibo vencido hace 15 días o más' },
  ];
  const { socioActivo: a, vencidoSignificativo: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

/**
 * FUSIONAR_SESIONES por infrautilización (Agenda A1) — una franja recurrente
 * lleva varias ocurrencias medio vacía. ALTA: a+b · MEDIA: solo a · sin BAJA.
 */
export function confianzaSesionInfrautilizada(c: {
  ocupacionBajaConsistente: boolean; // últimas ocurrencias por debajo del umbral
  patronSostenido: boolean;          // el patrón se repite en 5+ ocurrencias
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ocupacionBajaConsistente, etiqueta: 'ocupación por debajo del 30% en las últimas 3 ocurrencias' },
    { valor: c.patronSostenido, etiqueta: 'patrón sostenido durante 5 o más ocurrencias' },
  ];
  const { ocupacionBajaConsistente: a, patronSostenido: b } = c;
  return evaluarNivel(criterios, a && b, a, false);
}

/** ABRIR_SESION — ALTA: a+b+c · MEDIA: a+b · BAJA: solo a. */
// CONTACTAR_LEAD (Captación C1) — un lead/interesada lleva días sin avanzar.
// ALTA: a+b (madurado y sin contacto) · MEDIA: solo a · BAJA: solo b.
export function confianzaContactarLead(c: {
  leadMadurado: boolean;
  sinContactoReciente: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.leadMadurado, etiqueta: 'lead sin avanzar durante 7 días o más' },
    { valor: c.sinContactoReciente, etiqueta: 'sin contacto reciente' },
  ];
  const { leadMadurado: a, sinContactoReciente: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

// CONVERTIR_PRUEBA (Captación C2) — una socia en PRUEBA no ha comprado plan.
// ALTA: a+b (prueba madura y sin suscripción) · MEDIA: solo a · BAJA: solo b.
export function confianzaConvertirPrueba(c: {
  pruebaMadura: boolean;
  sinSuscripcion: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.pruebaMadura, etiqueta: 'prueba iniciada hace 7 días o más' },
    { valor: c.sinSuscripcion, etiqueta: 'sin suscripción activa' },
  ];
  const { pruebaMadura: a, sinSuscripcion: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

// Ocupación estructuralmente baja (Agenda A2) — muchas clases van casi vacías
// aunque no formen una franja recurrente única. ALTA: a+b (mayoría vacía y
// volumen alto de clases) · MEDIA: solo a · BAJA: solo b.
export function confianzaOcupacionBajaEstructural(c: {
  mayoriaVacia: boolean;   // la mayoría de las clases recientes fueron casi vacías
  volumenSuficiente: boolean; // hay bastantes clases como para que no sea ruido de arranque
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.mayoriaVacia, etiqueta: 'la mayoría de las clases recientes por debajo del 30% de ocupación' },
    { valor: c.volumenSuficiente, etiqueta: 'volumen de clases suficiente para descartar ruido de arranque' },
  ];
  const { mayoriaVacia: a, volumenSuficiente: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

export function confianzaAbrirSesion(c: {
  franjaLlenaConsistente: boolean;
  demandaInsatisfecha: boolean;
  patronSostenido: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.franjaLlenaConsistente, etiqueta: 'franja al 95%+ de ocupación en 3 o más ocurrencias seguidas' },
    { valor: c.demandaInsatisfecha, etiqueta: 'lista de espera media de 2 o más personas' },
    { valor: c.patronSostenido, etiqueta: 'patrón sostenido durante 5 o más semanas' },
  ];
  const { franjaLlenaConsistente: a, demandaInsatisfecha: b, patronSostenido: cc } = c;
  return evaluarNivel(criterios, a && b && cc, a && b, a);
}

/** RECUPERAR_PAGOS — ALTA: a+b+c · MEDIA: a+b · BAJA: solo a. */
export function confianzaRecuperarPagos(c: {
  tarjetaValida: boolean;
  vencidoMenos30d: boolean;
  socioActivo: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.tarjetaValida, etiqueta: 'tarjeta guardada válida' },
    { valor: c.vencidoMenos30d, etiqueta: 'recibo vencido hace menos de 30 días' },
    { valor: c.socioActivo, etiqueta: 'socia activa' },
  ];
  const { tarjetaValida: a, vencidoMenos30d: b, socioActivo: cc } = c;
  return evaluarNivel(criterios, a && b && cc, a && b, a);
}

/**
 * Autonomía efectiva de una recomendación (Núcleo §5.2): nunca puede superar
 * el techo que marca su nivel de confianza, aunque la regla declare más.
 */
export function resolverNivelAutonomia(declaradoPorLaRegla: NivelAutonomia, confianza: Confianza): NivelAutonomia {
  return Math.min(declaradoPorLaRegla, confianza.autonomiaMaxima) as NivelAutonomia;
}

// Autonomía que cada regla declara en DECISION-OS-ESPECIALISTAS.md (R1/R3/R4→1,
// R2→2, I1→1, I2→2). `Candidata` no lleva este campo (no forma parte de su
// contrato — es una propiedad del TIPO, no de la instancia), así que se
// resuelve aquí por tipo en el momento de persistir la Recomendacion.
const AUTONOMIA_DECLARADA_POR_TIPO: Partial<Record<TipoRecomendacion, NivelAutonomia>> = {
  RECUPERAR_SOCIA: 1,
  ENVIAR_REACTIVACION: 2,
  CONGELAR_MEMBRESIA: 1,
  ABRIR_SESION: 1,
  RECUPERAR_PAGOS: 2,
};

/** Autonomía efectiva por tipo (Núcleo §5.2) — nunca supera el techo de la confianza. Tipos sin regla MVP caen a 1 (recomendar, nunca automático). */
export function resolverNivelAutonomiaPorTipo(tipo: TipoRecomendacion, confianza: Confianza): NivelAutonomia {
  const declarada = AUTONOMIA_DECLARADA_POR_TIPO[tipo] ?? 1;
  return resolverNivelAutonomia(declarada, confianza);
}
