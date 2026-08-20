// Especialista en Captación / Conversión — ¿a quién dejamos escapar antes de
// que entre? Trabaja el embudo de leads (Socio.leadStage): LEAD/INTERESADA que
// se enfrían sin seguimiento, y PRUEBA que no llega a comprar plan. Cubre un
// punto ciego total: Retención mira a las socias YA activas, nadie miraba la
// entrada del embudo.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices, diasDesdeUltimoContacto, tasaAbandonoCheckout, type IndicesSenal } from '../senales.ts';
import { confianzaContactarLead, confianzaConvertirPrueba, confianzaAbandonoCheckout } from '../confianza.ts';
import { estimarProbabilidad, tasaBase, MUESTRA_MINIMA } from '../prediccion.ts';

const MS_DIA = 86400000;
const DIAS_LEAD_MADURO = 7;      // un lead sin avanzar tras 7 días se está enfriando
const DIAS_SIN_CONTACTO = 7;     // sin contacto en 7+ días (o ninguno) = descuidado
const DIAS_PRUEBA_MADURA = 7;    // una prueba de 7+ días sin comprar hay que cerrarla

const LEAD_STAGES_ENTRADA = new Set(['LEAD', 'INTERESADA']);

function diasDesde(fechaISO: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(fechaISO).getTime()) / MS_DIA);
}

/** C1 · Lead/interesada sin seguimiento → CONTACTAR_LEAD. */
function reglaC1(socio: SnapshotEstudio['socios'][number], idx: IndicesSenal, now: Date): Candidata | null {
  if (!socio.leadStage || !LEAD_STAGES_ENTRADA.has(socio.leadStage)) return null;
  // Una lead con suscripción activa ya está dentro: no es trabajo de captación.
  if (idx.suscripcionActivaPorSocio.has(socio.id)) return null;

  const diasAntiguedad = diasDesde(socio.fechaAlta, now);
  const leadMadurado = diasAntiguedad >= DIAS_LEAD_MADURO;

  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  const sinContactoReciente = diasContacto === null || diasContacto >= DIAS_SIN_CONTACTO;

  const confianza = confianzaContactarLead({ leadMadurado, sinContactoReciente });
  if (!confianza) return null;

  const etapa = socio.leadStage === 'LEAD' ? 'contactó por primera vez' : 'mostró interés';
  const motivoMotor = `${socio.nombre} ${etapa} hace ${diasAntiguedad} días y sigue sin dar el paso. Un mensaje ahora, mientras aún se acuerda de ti, marca la diferencia.`;

  return {
    especialista: 'CAPTACION',
    tipo: 'CONTACTAR_LEAD',
    dedupeKey: `CAPTACION:CONTACTAR_LEAD:${socio.id}`,
    tituloMotor: `${socio.nombre} sigue en el aire — yo la contactaría`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, etapa: socio.leadStage, diasAntiguedad, diasSinContacto: diasContacto ?? -1 },
    riesgo: 'PERDIDA',
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia: Math.min(0.8, 0.4 + 0.03 * diasAntiguedad),
    esfuerzo: 0.3,
  };
}

/** C2 · Prueba que no convierte → CONVERTIR_PRUEBA. */
function reglaC2(socio: SnapshotEstudio['socios'][number], idx: IndicesSenal, now: Date): Candidata | null {
  if (socio.leadStage !== 'PRUEBA') return null;
  const sinSuscripcion = !idx.suscripcionActivaPorSocio.has(socio.id);
  // Si ya tiene suscripción activa es que convirtió — nada que hacer.
  if (!sinSuscripcion) return null;

  const diasAntiguedad = diasDesde(socio.fechaAlta, now);
  const pruebaMadura = diasAntiguedad >= DIAS_PRUEBA_MADURA;

  const confianza = confianzaConvertirPrueba({ pruebaMadura, sinSuscripcion });
  if (!confianza) return null;

  const asistidas = idx.asistidasPorSocio.get(socio.id)?.length ?? 0;
  const motivoMotor = asistidas > 0
    ? `${socio.nombre} lleva ${diasAntiguedad} días de prueba y ya ha venido ${asistidas} ${asistidas === 1 ? 'vez' : 'veces'}, pero no ha cogido plan. Es el momento de proponérselo.`
    : `${socio.nombre} lleva ${diasAntiguedad} días desde que empezó la prueba y aún no ha cogido plan. Un empujón amable antes de que se enfríe.`;

  return {
    especialista: 'CAPTACION',
    tipo: 'CONVERTIR_PRUEBA',
    dedupeKey: `CAPTACION:CONVERTIR_PRUEBA:${socio.id}`,
    tituloMotor: `${socio.nombre} está a un paso de quedarse`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasAntiguedad, clasesProbadas: asistidas },
    riesgo: 'PERDIDA',
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 4,
    expiraEnDias: 14,
    urgencia: Math.min(0.85, 0.45 + 0.03 * diasAntiguedad),
    esfuerzo: 0.35,
  };
}

const C3_FRACCION_DEL_ESTUDIO = 0.7; // mismo criterio que F5_FRACCION_DEL_ESTUDIO (finanzas.ts)

/**
 * C3 · Abandono de checkout en el widget de reservas → REVISAR_ABANDONO_CHECKOUT
 * (agregada, sin socioId — auditoría vs Momence: ellos lo enseñan como número
 * en un dashboard, aquí compite por El Umbral como cualquier otra candidata).
 * Molde calcado de Agenda A2/Finanzas F5: agregado a nivel de estudio, y
 * comparado contra el propio histórico reciente, nunca contra un corte fijo.
 */
function reglaC3(s: SnapshotEstudio, now: Date): Candidata | null {
  const tasa = tasaAbandonoCheckout(s.widgetEventosCheckout, now);
  // QA (PR #1274): tasaBase() solo exige total>0, sin mínimo de muestra —
  // con 1-2 checkouts en la ventana base el prior sale 0% o 100% y genera
  // falsos positivos/negativos indistinguibles de una caída real. A
  // diferencia de agenda.ts/finanzas.ts (prior sobre TODAS las sesiones/
  // recibos del estudio, volumen amplio), aquí el prior sale de la MISMA
  // señal delgada que la ventana reciente — se exige el mismo MUESTRA_MINIMA
  // que ya aplica a la ventana reciente dentro de estimarProbabilidad().
  if (tasa.totalBase < MUESTRA_MINIMA) return null;
  const prior = tasaBase(tasa.exitosBase, tasa.totalBase);
  if (prior === null) return null; // sin ventana base — estudio recién abierto o widget recién activado

  const prediccion = estimarProbabilidad({
    exitos: tasa.exitosReciente,
    total: tasa.totalReciente,
    prior,
    base: `${tasa.exitosReciente} de ${tasa.totalReciente} checkouts recientes llegaron a completarse`,
  });
  if (!prediccion) return null; // historial insuficiente en la ventana reciente

  const confianza = confianzaAbandonoCheckout({
    historialSuficiente: true,
    caidaClara: prediccion.probabilidad < prior * C3_FRACCION_DEL_ESTUDIO,
  });
  if (!confianza || confianza.nivel === 'BAJA') return null;

  const pctHabitual = Math.round(prior * 100);
  const pctReciente = Math.round(prediccion.probabilidad * 100);
  const motivoMotor = `Normalmente ${pctHabitual}% de quienes empiezan a pagar en tu web terminan la reserva, pero en los últimos ${14} días ha bajado a ${pctReciente}% (${prediccion.base}). Algo en el paso de pago está frenando a gente que ya había decidido apuntarse — merece la pena revisarlo.`;

  return {
    especialista: 'CAPTACION',
    tipo: 'REVISAR_ABANDONO_CHECKOUT',
    dedupeKey: `CAPTACION:ABANDONO_CHECKOUT:${s.studioId}`,
    tituloMotor: `Se te está cayendo gente justo al pagar`,
    motivoMotor,
    datosUsados: {
      pctHabitual, pctReciente,
      checkoutsRecientes: tasa.totalReciente, completadosRecientes: tasa.exitosReciente,
    },
    riesgo: 'PERDIDA',
    confianza,
    prediccion,
    accion: { tipo: 'MARCAR_GESTIONADO' },
    tiempoEstimadoMin: 10,
    expiraEnDias: 14,
    urgencia: Math.min(0.75, 0.4 + (pctHabitual - pctReciente) / 100),
    esfuerzo: 0.5,
  };
}

export const captacion: Especialista = {
  id: 'CAPTACION',
  pregunta: '¿A quién estamos dejando escapar antes de que entre?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const socio of s.socios) {
      // Una candidata por socia: la prueba pesa más que el lead frío.
      const c = reglaC2(socio, idx, now) ?? reglaC1(socio, idx, now);
      if (c) candidatas.push(c);
    }
    const c3 = reglaC3(s, now);
    if (c3) candidatas.push(c3);
    return candidatas;
  },
};
