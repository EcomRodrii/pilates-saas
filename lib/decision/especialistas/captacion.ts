// Especialista en Captación / Conversión — ¿a quién dejamos escapar antes de
// que entre? Trabaja con el ESTADO de cada socia (el mismo que enseña Clientas,
// lib/clientas/estado.ts): las «Interesada» (ficha sin venir ni comprar) que se
// enfrían sin seguimiento, y las «De prueba» que vinieron a su clase y no
// compran. Antes leía `lead_stage`, que solo cambiaba un selector manual (ya
// retirado) y por eso casi nunca decía la verdad. Cubre un punto ciego total:
// Retención mira a las socias YA activas, nadie miraba la entrada.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices, diasDesdeUltimoContacto, estadosDelSnapshot, noQuiereSeguir, tasaAbandonoCheckout, type IndicesSenal } from '../senales.ts';
import { diasEntre, type ResultadoEstado } from '../../clientas/estado.ts';
import { hoyEnEstudio } from '../../utils.ts';
import { confianzaContactarLead, confianzaConvertirPrueba, confianzaAbandonoCheckout } from '../confianza.ts';
import { estimarProbabilidad, tasaBase, MUESTRA_MINIMA } from '../prediccion.ts';

const DIAS_LEAD_MADURO = 7;      // una interesada sin avanzar tras 7 días se está enfriando
const DIAS_SIN_CONTACTO = 7;     // sin contacto en 7+ días (o ninguno) = descuidado
const DIAS_PRUEBA_MADURA = 7;    // 7+ días desde su clase de prueba sin comprar: hay que cerrarla

/** C1 · Interesada (ficha sin venir ni comprar) sin seguimiento → CONTACTAR_LEAD. */
function reglaC1(socio: SnapshotEstudio['socios'][number], estado: ResultadoEstado | undefined, idx: IndicesSenal, now: Date): Candidata | null {
  // `desde` es su día de alta: sin él no se puede decir cuánto lleva.
  if (estado?.estado !== 'INTERESADA' || !estado.desde) return null;
  // Dijo que no quiere seguir (contacto apuntado en su ficha): no se insiste.
  if (noQuiereSeguir(socio.id, idx)) return null;

  const diasAntiguedad = diasEntre(estado.desde, hoyEnEstudio(now));
  const leadMadurado = diasAntiguedad >= DIAS_LEAD_MADURO;

  const diasContacto = diasDesdeUltimoContacto(socio.id, idx, now);
  const sinContactoReciente = diasContacto === null || diasContacto >= DIAS_SIN_CONTACTO;

  const confianza = confianzaContactarLead({ leadMadurado, sinContactoReciente });
  if (!confianza) return null;

  const motivoMotor = `${socio.nombre} se dio de alta hace ${diasAntiguedad} días y todavía no ha venido ni comprado nada. Un mensaje ahora, mientras aún se acuerda de ti, marca la diferencia.`;

  return {
    especialista: 'CAPTACION',
    tipo: 'CONTACTAR_LEAD',
    dedupeKey: `CAPTACION:CONTACTAR_LEAD:${socio.id}`,
    tituloMotor: `${socio.nombre} sigue en el aire — yo la contactaría`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, estado: 'INTERESADA', diasAntiguedad, diasSinContacto: diasContacto ?? -1 },
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

/** C2 · De prueba: tuvo su clase de prueba y no ha comprado → CONVERTIR_PRUEBA. */
function reglaC2(socio: SnapshotEstudio['socios'][number], estado: ResultadoEstado | undefined, vino: boolean, idx: IndicesSenal, now: Date): Candidata | null {
  // «De prueba» ya es «sin ninguna compra de verdad»; `desde` es el día de su prueba.
  if (estado?.estado !== 'DE_PRUEBA' || !estado.desde) return null;
  if (noQuiereSeguir(socio.id, idx)) return null;
  const diasAntiguedad = diasEntre(estado.desde, hoyEnEstudio(now));
  // Su prueba aún no ha llegado: no hay nada que cerrar todavía.
  if (diasAntiguedad < 0) return null;
  const pruebaMadura = diasAntiguedad >= DIAS_PRUEBA_MADURA;

  const confianza = confianzaConvertirPrueba({ pruebaMadura, sinSuscripcion: true });
  if (!confianza) return null;

  // «Vino» sale de sus hechos (todo su historial); cuántas veces, de las reservas
  // de la foto. Sin asistencia marcada no se afirma que no viniera: muchos
  // estudios no pasan lista.
  const asistidas = idx.asistidasPorSocio.get(socio.id)?.length ?? 0;
  const motivoMotor = asistidas > 1
    ? `${socio.nombre} vino a su clase de prueba hace ${diasAntiguedad} días y ya ha venido ${asistidas} veces, pero no ha cogido plan. Es el momento de proponérselo.`
    : vino || asistidas === 1
      ? `${socio.nombre} vino a su clase de prueba hace ${diasAntiguedad} días y aún no ha cogido plan. Es el momento de proponérselo.`
      : `${socio.nombre} tenía su clase de prueba hace ${diasAntiguedad} días y aún no ha cogido plan. Un empujón amable antes de que se enfríe.`;

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
    const estados = estadosDelSnapshot(s, now);
    const candidatas: Candidata[] = [];
    for (const socio of s.socios) {
      // Una candidata por socia (cada una tiene un solo estado).
      const estado = estados.get(socio.id);
      const vino = Boolean(s.hechosClientas?.[socio.id]?.ultimaAsistencia);
      const c = reglaC2(socio, estado, vino, idx, now) ?? reglaC1(socio, estado, idx, now);
      if (c) candidatas.push(c);
    }
    const c3 = reglaC3(s, now);
    if (c3) candidatas.push(c3);
    return candidatas;
  },
};
