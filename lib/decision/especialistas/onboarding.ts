// Especialista en Onboarding — ¿está encaminada una socia nueva en sus
// primeros 30 días? El informe estratégico ago-2026 documenta que 4 visitas
// + 2 conocidas en los primeros 30 días predicen fuertemente la permanencia,
// y que 3 de cada 4 primerizas nunca vuelven a comprar. Cubre la franja que
// hoy nadie del Decision OS mira: RETENCION excluye explícitamente
// antiguedadDias < 30 (necesita 8 semanas de historial), CAPTACION cubre el
// embudo pre-conversión (LEAD/INTERESADA/PRUEBA) — una socia recién dada de
// alta ya convirtió y no encaja en ninguno de los dos.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices, diasDesdeAlta, visitasEnOnboarding, conocidasEnOnboarding, type IndicesSenal } from '../senales.ts';
import { confianzaImpulsarOnboarding } from '../confianza.ts';

const OBJETIVO_VISITAS = 4;
const OBJETIVO_CONOCIDAS = 2;
const VENTANA_DIAS = 30;
const DIAS_AVISO = 7; // quedan ≤7 días de la ventana → hora de avisar

const LEAD_STAGES_PRE_CONVERSION = new Set(['LEAD', 'INTERESADA', 'PRUEBA']);

/** O1 · Ritmo insuficiente a pocos días de cerrar la ventana de 30 días → IMPULSAR_ONBOARDING. */
function reglaO1(socio: SnapshotEstudio['socios'][number], idx: IndicesSenal, now: Date): Candidata | null {
  if (!socio.activo) return null;
  // Aún en el embudo de conversión (nunca llegó a comprar) — es trabajo de
  // CAPTACION, no de aquí.
  if (socio.leadStage && LEAD_STAGES_PRE_CONVERSION.has(socio.leadStage)) return null;

  const dias = diasDesdeAlta(socio.id, idx, now);
  if (dias === null || dias < 0 || dias > VENTANA_DIAS) return null;

  const visitas = visitasEnOnboarding(socio.id, idx);
  const conocidas = conocidasEnOnboarding(socio.id, idx);
  const ritmoInsuficiente = visitas < OBJETIVO_VISITAS || conocidas < OBJETIVO_CONOCIDAS;
  const ventanaCasiCerrada = dias >= VENTANA_DIAS - DIAS_AVISO;
  const diasRestantes = VENTANA_DIAS - dias;
  const plazoInminente = diasRestantes <= 3;

  const confianza = confianzaImpulsarOnboarding({ ventanaCasiCerrada, ritmoInsuficiente, plazoInminente });
  if (!confianza) return null;
  const faltaVisitas = Math.max(0, OBJETIVO_VISITAS - visitas);
  const faltaConocidas = Math.max(0, OBJETIVO_CONOCIDAS - conocidas);
  const partes: string[] = [];
  if (faltaVisitas > 0) partes.push(`le faltan ${faltaVisitas} ${faltaVisitas === 1 ? 'visita' : 'visitas'}`);
  if (faltaConocidas > 0) partes.push(faltaConocidas === 1 ? 'traer a alguien conocido' : `traer a ${faltaConocidas} conocidas`);
  const motivoMotor = `${socio.nombre} lleva ${dias} días desde el alta y ${partes.join(' y ')} para llegar a las 4 visitas + 2 conocidas que predicen que se quede. Quedan ${diasRestantes} días — un mensaje ahora puede cambiar el rumbo.`;

  return {
    especialista: 'ONBOARDING',
    tipo: 'IMPULSAR_ONBOARDING',
    dedupeKey: `ONBOARDING:IMPULSAR_ONBOARDING:${socio.id}`,
    tituloMotor: `${socio.nombre} no coge ritmo — quedan ${diasRestantes} días`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, diasDesdeAlta: dias, visitas, conocidas, diasRestantes },
    riesgo: 'PERDIDA',
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: diasRestantes > 0 ? diasRestantes : 3,
    urgencia: Math.min(0.85, 0.5 + 0.05 * (VENTANA_DIAS - diasRestantes)),
    esfuerzo: 0.3,
  };
}

export const onboarding: Especialista = {
  id: 'ONBOARDING',
  pregunta: '¿Está encaminada una socia nueva en sus primeros 30 días?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const socio of s.socios) {
      const c = reglaO1(socio, idx, now);
      if (c) candidatas.push(c);
    }
    return candidatas;
  },
};
