// Especialista en Finanzas — ¿qué ingresos recurrentes están en riesgo?
// MVP: F1 · bono casi agotado → proponer renovación antes de que la socia se
// quede sin sesiones (y deje de venir). Cubre el tipo PROPONER_RENOVACION_BONO,
// que existía en el catálogo pero ningún especialista generaba.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices, type IndicesSenal } from '../senales.ts';
import { confianzaRenovarBono } from '../confianza.ts';

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** F1 · Bono con 1 o 0 sesiones → PROPONER_RENOVACION_BONO. */
function reglaF1(socio: SnapshotEstudio['socios'][number], idx: IndicesSenal): Candidata | null {
  const sus = idx.suscripcionActivaPorSocio.get(socio.id);
  if (!sus || sus.sesionesRestantes == null || sus.sesionesRestantes > 1) return null;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO') return null;

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
    for (const socio of s.socios) {
      const c = reglaF1(socio, idx);
      if (c) candidatas.push(c);
    }
    return candidatas;
  },
};
