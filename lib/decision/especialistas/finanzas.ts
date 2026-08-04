// Especialista en Finanzas — ¿qué ingresos recurrentes están en riesgo?
// MVP: F1 · bono casi agotado → proponer renovación antes de que la socia se
// quede sin sesiones (y deje de venir). Cubre el tipo PROPONER_RENOVACION_BONO,
// que existía en el catálogo pero ningún especialista generaba.
// F2 (informe fila 16): bono repetido cuyo coste real por sesión supera el
// plan mensual equivalente → PROPONER_SUSCRIPCION_MENSUAL.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Suscripcion } from '@/lib/types';
import { construirIndices, frecuenciaHabitualPorTipoClase, type IndicesSenal } from '../senales.ts';
import { confianzaRenovarBono, confianzaProponerSuscripcionMensual } from '../confianza.ts';
import { planCubreTipoClase } from '../../bono-logic.ts';

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const MS_DIA = 86400000;

/**
 * F1 · Bono con 1 o 0 sesiones → PROPONER_RENOVACION_BONO. Itera TODAS las
 * suscripciones ACTIVAS, no `idx.suscripcionActivaPorSocio` (índice de UNA
 * sola suscripción por socia, pensado para "cuánto vale al mes" — con
 * `planes_por_tipo_de_clase` una socia puede tener un plan MENSUAL de
 * reformer Y un bono de mat sueltos a la vez; el índice solo se queda con
 * la primera y la segunda quedaba invisible para F1, punto ciego real del
 * feedback P2-5).
 */
function reglaF1(sus: Suscripcion, idx: IndicesSenal): Candidata | null {
  if (sus.sesionesRestantes == null || sus.sesionesRestantes > 1) return null;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO') return null;
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio) return null;

  const confianza = confianzaRenovarBono({ bonoCasiAgotado: sus.sesionesRestantes <= 1, socioActivo: socio.activo });
  if (!confianza) return null;

  const restantes = sus.sesionesRestantes;
  const motivoMotor = restantes === 0
    ? `${socio.nombre} ha gastado todas las sesiones de su bono. Es el momento de proponerle renovar antes de que se enfríe.`
    : `A ${socio.nombre} le queda 1 sesión de su bono. Si le proponemos renovar ahora, no se queda sin venir.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'PROPONER_RENOVACION_BONO',
    dedupeKey: `FINANZAS:PROPONER_RENOVACION_BONO:${socio.id}`,
    tituloMotor: `A ${socio.nombre} se le acaba el bono`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, sesionesRestantes: restantes, plan: plan.nombre, precio: plan.precio },
    riesgo: 'PERDIDA',
    impacto: plan.precio > 0 ? { valor: redondear2(plan.precio), unidad: 'EUR', formula: `renovación del bono ${plan.nombre}: ${plan.precio}€` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia: restantes === 0 ? 0.7 : 0.55,
    esfuerzo: 0.3,
  };
}

const AHORRO_MINIMO = 0.20; // ≥20% más barata la mensual para que valga molestar
const VENTANA_PATRON_DIAS = 90;
const MIN_BONOS_PATRON = 2; // el activo cuenta, así que exige al menos 1 renovación previa

/**
 * F2 · Bono repetido (informe fila 16) → PROPONER_SUSCRIPCION_MENSUAL. Solo
 * cuando el estudio vende un plan MENSUAL que cubre el mismo tipo de clase
 * (si no, no hay nada real que ofrecer — se descarta, no se inventa un plan).
 * `frecuenciaHabitual` exige ≥4 asistencias en las últimas 8 semanas: sin eso
 * no hay dato fiable de cuánto gastaría al mes, así que tampoco genera candidata.
 */
function reglaF2(sus: Suscripcion, idx: IndicesSenal, s: SnapshotEstudio, now: Date): Candidata | null {
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO' || !plan.sesiones || plan.precio <= 0) return null;
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio || !socio.activo) return null;

  const tipoClaseId = plan.tiposClaseIds?.[0] ?? null;
  const planMensual = s.planesTarifa.find(p =>
    p.studioId === plan.studioId && p.tipo === 'MENSUAL' && p.activo && p.precio > 0
    && planCubreTipoClase(p, tipoClaseId)
  );
  if (!planMensual) return null;

  // Acotada al tipo de clase del bono, no la frecuencia TOTAL de la socia —
  // si no, una socia que también asiste a otra disciplina con otro plan
  // (planes_por_tipo_de_clase) infla la frecuencia y abarata artificialmente
  // el coste estimado del mensual (mismo punto ciego que P2-5 ya corrigió en F1).
  const freq = frecuenciaHabitualPorTipoClase(sus.socioId, tipoClaseId, idx);
  if (freq === null || freq <= 0) return null;

  const costeEfectivoPorSesion = plan.precio / plan.sesiones;
  const costeMensualPorSesion = planMensual.precio / (freq * 4.33);
  if (costeMensualPorSesion >= costeEfectivoPorSesion) return null;
  const ahorroRelativo = (costeEfectivoPorSesion - costeMensualPorSesion) / costeEfectivoPorSesion;

  const desde = now.getTime() - VENTANA_PATRON_DIAS * MS_DIA;
  const bonosRecientes = (idx.suscripcionesPorSocio.get(sus.socioId) ?? []).filter(x => {
    const p = idx.planPorId.get(x.planId);
    if (!p || p.tipo !== 'BONO') return false;
    if (p.id !== plan.id) return false; // mismo bono exacto, no solo el mismo tipo de clase
    return new Date(x.fechaInicio).getTime() >= desde;
  });

  const confianza = confianzaProponerSuscripcionMensual({
    ahorroClaro: ahorroRelativo >= AHORRO_MINIMO,
    patronSostenido: bonosRecientes.length >= MIN_BONOS_PATRON,
  });
  if (!confianza) return null;

  const ahorroMensualEur = redondear2((costeEfectivoPorSesion - costeMensualPorSesion) * freq * 4.33);
  const motivoMotor = `${socio.nombre} lleva varios bonos de ${plan.nombre} seguidos y viene ${redondear2(freq)}×/semana de media. Con el plan ${planMensual.nombre} pagaría menos por lo mismo — le ahorraría unos ${ahorroMensualEur}€/mes.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'PROPONER_SUSCRIPCION_MENSUAL',
    dedupeKey: `FINANZAS:PROPONER_SUSCRIPCION_MENSUAL:${socio.id}`,
    tituloMotor: `${socio.nombre} saldría ganando con una mensualidad`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, bonoActual: plan.nombre, planMensual: planMensual.nombre,
      frecuenciaSemanal: redondear2(freq), ahorroRelativoPct: redondear2(ahorroRelativo * 100),
    },
    riesgo: 'OPORTUNIDAD',
    impacto: { valor: ahorroMensualEur, unidad: 'EUR_MES', formula: `diferencia de coste mensual entre ${plan.nombre} y ${planMensual.nombre} a su frecuencia real` },
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 21,
    urgencia: 0.3,
    esfuerzo: 0.3,
  };
}

export const finanzas: Especialista = {
  id: 'FINANZAS',
  pregunta: '¿Qué ingresos recurrentes están en riesgo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const sus of s.suscripciones) {
      if (sus.estado !== 'ACTIVA') continue;
      const candidata = reglaF1(sus, idx) ?? reglaF2(sus, idx, s, now);
      if (candidata) candidatas.push(candidata);
    }
    return candidatas;
  },
};
