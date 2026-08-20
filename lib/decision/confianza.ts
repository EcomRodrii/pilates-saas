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

/**
 * CONGELAR_MEMBRESIA (Retención R6) — socia con MENSUAL vigente que sigue PAGANDO
 * pero lleva mucho sin venir. En vez de dejar que cancele con mala sensación, se
 * le ofrece congelar/pausar (gesto de buena fe que retiene). El criterio primario
 * es la ausencia prolongada (a); la ausencia MUY prolongada (b) solo eleva la
 * confianza. ALTA: a+b · MEDIA: solo a · sin BAJA (nunca por b sola).
 */
export function confianzaCongelarMembresia(c: {
  ausenciaProlongada: boolean;    // ≥45 días sin venir aun pagando mensualidad
  ausenciaMuyProlongada: boolean; // ≥60 días — ya desenganchada del todo
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ausenciaProlongada, etiqueta: 'más de 45 días sin venir pese a seguir pagando la mensualidad' },
    { valor: c.ausenciaMuyProlongada, etiqueta: 'más de 60 días sin aparecer' },
  ];
  const { ausenciaProlongada: a, ausenciaMuyProlongada: b } = c;
  return evaluarNivel(criterios, a && b, a, false);
}

/**
 * REVISAR_PRECIO (Ingresos I4) — un plan MENSUAL cuyo precio por sesión real
 * (según cuánto lo usan sus socias) queda muy por debajo de la media del estudio:
 * hay margen para revisarlo al alza. Juicio de negocio del propietario → se topa
 * en MEDIA (nunca alarma). Requiere AMBOS criterios; si no, no se emite.
 */
export function confianzaRevisarPrecio(c: {
  suficientesHolders: boolean;      // varias socias activas en ese plan (no un caso aislado)
  claramenteInfravalorado: boolean; // precio/sesión muy por debajo de la media del estudio
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.suficientesHolders, etiqueta: 'varias socias activas en el mismo plan' },
    { valor: c.claramenteInfravalorado, etiqueta: 'precio por sesión muy por debajo de la media del estudio' },
  ];
  const { suficientesHolders: a, claramenteInfravalorado: b } = c;
  return evaluarNivel(criterios, false, a && b, false);
}

/**
 * MOVER_HORARIO (Agenda A3) — una franja recurrente va medio vacía PERO el mismo
 * tipo de clase se llena en otro horario: el problema es la hora, no la clase.
 * Juicio del propietario → se topa en MEDIA. Requiere AMBOS criterios.
 */
export function confianzaMoverHorario(c: {
  franjaVaciaConsistente: boolean;  // esta franja lleva varias ocurrencias medio vacía
  existeAlternativaLlena: boolean;  // otra franja del mismo tipo va claramente llena
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.franjaVaciaConsistente, etiqueta: 'franja por debajo del 30% en las últimas 3 ocurrencias' },
    { valor: c.existeAlternativaLlena, etiqueta: 'el mismo tipo de clase se llena en otro horario' },
  ];
  const { franjaVaciaConsistente: a, existeAlternativaLlena: b } = c;
  return evaluarNivel(criterios, false, a && b, false);
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

// IMPULSAR_ONBOARDING — a diferencia del resto de reglas de captación/retención,
// "no llega a 4 visitas + 2 conocidas en 30 días" es una predicción social
// (correlación con permanencia), no una comprobación de saldo o de fecha
// vencida — nunca ALTA (nunca autonomiaMaxima=2): esAlta siempre false.
// Dispara solo si AMBAS: ventana casi cerrada Y ritmo insuficiente — ninguna
// sola basta (ventanaCasiCerrada sola con ritmo YA cumplido no tiene sentido
// avisar; ritmoInsuficiente sola en el día 2 tampoco, es demasiado pronto
// para saber nada). MEDIA solo si además quedan ≤3 días (última oportunidad).
export function confianzaImpulsarOnboarding(c: {
  ventanaCasiCerrada: boolean;
  ritmoInsuficiente: boolean;
  plazoInminente: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ventanaCasiCerrada, etiqueta: 'quedan 7 días o menos de la ventana de onboarding' },
    { valor: c.ritmoInsuficiente, etiqueta: 'no llega al ritmo de 4 visitas + 2 conocidas en 30 días' },
    { valor: c.plazoInminente, etiqueta: 'quedan 3 días o menos' },
  ];
  const base = c.ventanaCasiCerrada && c.ritmoInsuficiente;
  return evaluarNivel(criterios, false, base && c.plazoInminente, base);
}

/**
 * RIESGO_RESERVA_FALLIDA (informe fila 14) — nunca ALTA a propósito: son
 * intentos rechazados, no un impago confirmado ni una baja real, sigue
 * siendo una predicción de frustración/riesgo, mismo criterio que ONBOARDING.
 * BAJA con 2+ intentos en la ventana, MEDIA con 3+ (racha, no un despiste).
 */
export function confianzaRiesgoReservaFallida(c: { nIntentos: number }): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.nIntentos >= 2, etiqueta: `${c.nIntentos} intentos de reserva rechazados en la ventana reciente` },
    { valor: c.nIntentos >= 3, etiqueta: 'racha de 3 o más intentos rechazados' },
  ];
  return evaluarNivel(criterios, false, c.nIntentos >= 3, c.nIntentos >= 2);
}

// Ocupación estructuralmente baja (Agenda A2) — un nº relevante de clases van
// casi vacías aunque no formen una franja recurrente única. El criterio primario
// es que HAYA clases casi vacías (a); la proporción alta (b) solo eleva la
// confianza. NUNCA se dispara por (b) sola: un estudio con muchas clases pero
// llenas no debe recibir este aviso. ALTA: a+b · MEDIA: solo a · sin BAJA.
export function confianzaOcupacionBajaEstructural(c: {
  bastantesVacias: boolean; // nº de clases casi vacías por encima del umbral
  proporcionAlta: boolean;  // además son una fracción alta del total
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.bastantesVacias, etiqueta: 'varias clases recientes por debajo del 30% de ocupación' },
    { valor: c.proporcionAlta, etiqueta: 'son una parte importante de todas las clases' },
  ];
  const { bastantesVacias: a, proporcionAlta: b } = c;
  return evaluarNivel(criterios, a && b, a, false);
}

// REVISAR_ABANDONO_CHECKOUT (Captación C3) — el checkout del widget se está
// cayendo por debajo de SU PROPIO histórico, no de un corte fijo (auditoría
// vs Momence: "cae mucho" no significa lo mismo en un estudio con 95% de
// conversión que en uno con 60%, mismo criterio que confianzaRiesgoDeCobro).
// Techo MEDIA a propósito: es una estimación sobre pocas sesiones anónimas,
// nunca algo tan seguro como para marcarlo ALTA.
// MEDIA: a+b (histórico suficiente Y caída clara). BAJA: solo a.
export function confianzaAbandonoCheckout(c: {
  historialSuficiente: boolean;
  caidaClara: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.historialSuficiente, etiqueta: 'suficientes checkouts recientes con desenlace conocido' },
    { valor: c.caidaClara, etiqueta: 'la tasa de éxito reciente cae claramente frente a la habitual de este estudio' },
  ];
  const { historialSuficiente: a, caidaClara: b } = c;
  return evaluarNivel(criterios, false, a && b, a);
}

// PROPONER_RENOVACION_BONO (Finanzas F1) — a una socia con bono casi agotado se
// le propone renovar antes de que se quede sin sesiones (y sin venir).
// ALTA: a+b (bono al límite y socia activa) · MEDIA: solo a · BAJA: solo b.
export function confianzaRenovarBono(c: {
  bonoCasiAgotado: boolean;
  socioActivo: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.bonoCasiAgotado, etiqueta: 'bono con 1 o 0 sesiones restantes' },
    { valor: c.socioActivo, etiqueta: 'socia activa' },
  ];
  const { bonoCasiAgotado: a, socioActivo: b } = c;
  return evaluarNivel(criterios, a && b, a, b);
}

// PROPONER_SUSCRIPCION_MENSUAL (Finanzas F2, informe fila 16) — el coste real
// de sus bonos repetidos supera lo que pagaría con el plan mensual
// equivalente. `patronSostenido` es el criterio base, no uno más: sin
// repetición, un ahorro que se ve bien en un solo bono es ruido de una
// socia que acaba de empezar (su frecuencia todavía no es un hábito) — nunca
// dispara sola. Techo deliberado en MEDIA aunque se cumplan ambos criterios:
// es una predicción sobre gasto futuro (depende de que la frecuencia se
// mantenga), no un hecho verificable como "sesiones restantes = 0" — mismo
// criterio que confianzaOcupacionBajaEstructural techa por debajo del máximo
// teórico.
export function confianzaProponerSuscripcionMensual(c: {
  ahorroClaro: boolean;      // ahorraría ≥20% pasándose a mensual
  patronSostenido: boolean;  // ≥2 bonos del mismo plan/tipo en 90 días
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.ahorroClaro, etiqueta: 'ahorraría un 20% o más pasándose a mensual' },
    { valor: c.patronSostenido, etiqueta: 'lleva comprando bonos seguidos del mismo tipo' },
  ];
  const { ahorroClaro: a, patronSostenido: b } = c;
  return evaluarNivel(criterios, false, a && b, b && !a);
}

// PREPARAR_CAMPANA (Marketing M1) — hay volumen suficiente de socias inactivas /
// leads para que merezca la pena una campaña. ALTA: a+b · MEDIA: solo a · sin BAJA.
export function confianzaPrepararCampana(c: {
  volumenSuficiente: boolean;
  sinCampanaReciente: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.volumenSuficiente, etiqueta: 'volumen suficiente de socias a reactivar/convertir' },
    { valor: c.sinCampanaReciente, etiqueta: 'sin campaña reciente a ese público' },
  ];
  const { volumenSuficiente: a, sinCampanaReciente: b } = c;
  return evaluarNivel(criterios, a && b, a, false);
}

// REVISAR_CARGA_EQUIPO (Equipo E1) — una instructora que daba clases se ha
// quedado sin ninguna asignada próximamente. Criterio único → MEDIA.
export function confianzaCargaEquipo(c: { huecoClaro: boolean }): Confianza | null {
  const criterios: Criterio[] = [{ valor: c.huecoClaro, etiqueta: 'instructora activa sin clases próximas pese a haber dado clases hace poco' }];
  return evaluarNivel(criterios, false, c.huecoClaro, false);
}

// REVISAR_CARGA_EQUIPO (Equipo E2, P2-5) — una sustitución sigue en
// 'contactando' pasado un margen razonable: el motor automático de
// sustituciones no ha resuelto sola, toca que alguien mire el panel.
export function confianzaSustitucionSinResolver(c: { sinResolverTrasPlazo: boolean }): Confianza | null {
  const criterios: Criterio[] = [{ valor: c.sinResolverTrasPlazo, etiqueta: 'sustitución sin confirmar pasado el plazo de contacto' }];
  return evaluarNivel(criterios, false, c.sinResolverTrasPlazo, false);
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

/**
 * LLENAR_PLAZAS (Agenda A4) — pronóstico de que una clase FUTURA se quede a
 * medias. A diferencia del resto, la evidencia no es histórica sino
 * prospectiva, así que el techo es MEDIA: por muy clara que sea la curva de
 * reserva, esto sigue siendo una predicción y la propietaria decide.
 *
 * ALTA: nunca (a propósito — no se auto-ejecuta un aviso masivo a socias).
 * MEDIA: a+b (va por detrás de su costumbre Y hay a quién avisar).
 * BAJA: solo a.
 */
export function confianzaLlenarPlazas(c: {
  porDetrasDeLoHabitual: boolean;   // lleva menos reservas de las que suele a estos días vista
  hayCandidatasCompatibles: boolean; // existe gente real a la que ofrecérselo
  curvaFiable: boolean;              // suficientes ocurrencias pasadas de la franja
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.porDetrasDeLoHabitual, etiqueta: 'va por detrás de lo que esta franja suele llevar a estos días vista' },
    { valor: c.hayCandidatasCompatibles, etiqueta: 'hay socias compatibles con plan en vigor a las que ofrecer la plaza' },
    { valor: c.curvaFiable, etiqueta: 'la franja tiene bastantes ocurrencias pasadas con las que comparar' },
  ];
  const { porDetrasDeLoHabitual: a, hayCandidatasCompatibles: b, curvaFiable: cc } = c;
  return evaluarNivel(criterios, false, a && b && cc, a);
}

/**
 * CUBRIR_CLASE_EN_RIESGO (Agenda A5) — una clase futura cuya instructora no va
 * a poder darla: tiene una ausencia grabada que la pisa, o está asignada a dos
 * clases solapadas a la vez.
 *
 * Único caso de todo el motor donde el hecho NO es estadístico sino
 * comprobable: o hay un choque en el calendario, o no lo hay. Por eso solo
 * tiene un nivel, ALTA, y no hay rama de "indicio".
 *
 * ⚠️ Deliberadamente NO se usa "no ha declarado disponibilidad para esa franja"
 * como señal: en un estudio donde el equipo no ha rellenado la rejilla de
 * disponibilidad —que son la mayoría al empezar— eso marcaría en riesgo TODAS
 * las clases del horario. Ese hueco ya lo cuenta `avisoEquipoIncompleto`
 * (lib/sustituciones/preparacion.ts) una sola vez, que es donde corresponde.
 */
export function confianzaCubrirClaseEnRiesgo(c: { choqueConfirmado: boolean }): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.choqueConfirmado, etiqueta: 'la instructora tiene una ausencia grabada o otra clase a esa misma hora' },
  ];
  return evaluarNivel(criterios, c.choqueConfirmado, false, false);
}

/**
 * PROPONER_RENOVACION_BONO por CADUCIDAD (Finanzas F3) — a la socia le quedan
 * sesiones pagadas y su bono caduca pronto. Distinto de F1, que mira el bono
 * casi AGOTADO: aquí el problema es el contrario (le sobran sesiones y se le
 * va a pasar el plazo), y el daño no es solo el dinero — es que pagó por algo
 * que no llegó a usar, que es como se pierde a una socia sin que se queje.
 *
 * ALTA: a+b (caduca ya Y le sobran bastantes) · MEDIA: solo a · BAJA: nunca —
 * si no caduca pronto no hay nada que avisar todavía.
 */
export function confianzaBonoCaducaSinUsar(c: {
  caducaPronto: boolean;
  bastantesSesionesSinUsar: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.caducaPronto, etiqueta: 'el bono caduca en los próximos días' },
    { valor: c.bastantesSesionesSinUsar, etiqueta: 'le quedan varias sesiones pagadas sin usar' },
  ];
  const { caducaPronto: a, bastantesSesionesSinUsar: b } = c;
  return evaluarNivel(criterios, a && b, a, false);
}

/**
 * COBRAR_PENDIENTE por CADUCIDAD DE TARJETA (Finanzas F4) — la tarjeta guardada
 * de una socia con cuota recurrente caduca antes de su próximo cobro.
 *
 * Es el único aviso de dinero de todo el motor que NO es una estimación: o la
 * tarjeta caduca antes de esa fecha o no caduca. Por eso llega a ALTA con un
 * solo criterio; el segundo solo distingue "ya ha caducado" (más urgente) de
 * "va a caducar".
 */
export function confianzaTarjetaCaduca(c: { caducaAntesDelCobro: boolean }): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.caducaAntesDelCobro, etiqueta: 'la tarjeta guardada caduca antes de su próximo cobro' },
  ];
  return evaluarNivel(criterios, c.caducaAntesDelCobro, false, false);
}

/**
 * RECUPERAR_PAGOS por RIESGO (Finanzas F5) — a esta socia le han fallado cobros
 * antes y tiene otro por delante. A diferencia del resto de Finanzas, esto SÍ es
 * una estimación, así que el techo es MEDIA: no se toca el dinero de nadie por
 * una probabilidad.
 *
 * MEDIA: a+b (historial suficiente Y probabilidad de fallo alta).
 * BAJA: solo a — hay historial pero no es alarmante.
 */
export function confianzaRiesgoDeCobro(c: {
  historialSuficiente: boolean;
  probabilidadAlta: boolean;
}): Confianza | null {
  const criterios: Criterio[] = [
    { valor: c.historialSuficiente, etiqueta: 'suficientes cobros suyos con desenlace conocido' },
    { valor: c.probabilidadAlta, etiqueta: 'su histórico de cobro está muy por debajo del resto del estudio' },
  ];
  const { historialSuficiente: a, probabilidadAlta: b } = c;
  return evaluarNivel(criterios, false, a && b, a);
}
