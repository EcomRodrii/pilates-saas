// ─────────────────────────────────────────────────────────────────────────────
// Frases humanas del Decision OS. `ALTA`/`MEDIA`/`BAJA` es vocabulario de
// dentro del motor — nunca se muestra crudo a la propietaria (ni en la
// notificación ni en la UI). Ver "regla de lenguaje" del Umbral.
// ─────────────────────────────────────────────────────────────────────────────
import type { NivelConfianza, Riesgo, TipoRecomendacion } from './tipos.ts';

const FRASES: Record<NivelConfianza, string> = {
  ALTA: 'Confianza alta.',
  MEDIA: 'Confianza media.',
  BAJA: 'Confianza baja.',
};

export function fraseConfianza(nivel: NivelConfianza): string {
  return FRASES[nivel];
}

// Etiqueta que acompaña siempre a una cifra económica del Decision OS: nunca
// un número desnudo (podría leerse como dinero garantizado). `PERDIDA` es
// ingreso que ya tienes y podrías dejar de tener → "en riesgo"; los tipos de
// cobro pendiente son ingreso que ya existe pero aún no ha entrado →
// "recuperables"; el resto es upside que aún no ha pasado → "estimado".
const TIPOS_RECUPERABLES: TipoRecomendacion[] = ['RECUPERAR_PAGOS', 'COBRAR_PENDIENTE'];

export function etiquetaImpacto(riesgo: Riesgo, tipo: TipoRecomendacion): string {
  if (riesgo === 'PERDIDA') return 'Ingresos en riesgo';
  if (TIPOS_RECUPERABLES.includes(tipo)) return 'Ingresos potenciales recuperables';
  return 'Impacto potencial estimado';
}
