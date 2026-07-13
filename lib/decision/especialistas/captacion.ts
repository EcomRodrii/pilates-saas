// Especialista en Captación / Conversión — ¿a quién dejamos escapar antes de
// que entre? Trabaja el embudo de leads (Socio.leadStage): LEAD/INTERESADA que
// se enfrían sin seguimiento, y PRUEBA que no llega a comprar plan. Cubre un
// punto ciego total: Retención mira a las socias YA activas, nadie miraba la
// entrada del embudo.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices, diasDesdeUltimoContacto, type IndicesSenal } from '../senales.ts';
import { confianzaContactarLead, confianzaConvertirPrueba } from '../confianza.ts';

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
    return candidatas;
  },
};
