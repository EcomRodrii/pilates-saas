// Especialista en Finanzas — ¿qué ingresos recurrentes están en riesgo?
// MVP: F1 · bono casi agotado → proponer renovación antes de que la socia se
// quede sin sesiones (y deje de venir). Cubre el tipo PROPONER_RENOVACION_BONO,
// que existía en el catálogo pero ningún especialista generaba.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Suscripcion } from '@/lib/types';
import { construirIndices, type IndicesSenal } from '../senales.ts';
import { confianzaRenovarBono } from '../confianza.ts';

const redondear2 = (n: number) => Math.round(n * 100) / 100;

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

export const finanzas: Especialista = {
  id: 'FINANZAS',
  pregunta: '¿Qué ingresos recurrentes están en riesgo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, _now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const sus of s.suscripciones) {
      if (sus.estado !== 'ACTIVA') continue;
      const c = reglaF1(sus, idx);
      if (c) candidatas.push(c);
    }
    return candidatas;
  },
};
