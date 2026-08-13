import type { Socio } from '@/lib/types';

// Guard de consentimiento de marketing (art. 7.4 RGPD) — ver
// docs/marketing-integrations-arquitectura.md §7. Mismo principio que el
// guard de AceptacionContrato.versionTexto en lib/inngest/penalizaciones.ts:
// `texto` es el texto COMPLETO que la socia aceptó
// (lib/legal-textos.ts textoConsentimientoMarketing), no un número de
// versión — si el texto vigente cambia, deja de coincidir y la socia deja
// de contar como consentida hasta que vuelva a decir que sí.

// Comprobación EXACTA (compara el texto completo) — es la que de verdad
// decide si se envía o no. Requiere `texto` poblado: el panel NO lo trae por
// defecto (mismo ahorro de payload que aceptacionContrato.versionTexto, ver
// mapSocio en lib/supabase-data.ts) — quien vaya a enviar de verdad debe
// traer la columna con su propio select, targeted, como ya hace
// lib/inngest/penalizaciones.ts.
export function tieneConsentimientoMarketingVigente(
  consentimientoTexto: string | undefined,
  textoVigente: string,
): boolean {
  return !!consentimientoTexto && consentimientoTexto === textoVigente;
}

// Aproximación barata para la UI (presencia, no vigencia exacta) — el panel
// no trae el texto completo, así que no puede comparar. Sirve para el
// recuento inmediato al pulsar "Enviar"; el envío real vuelve a comprobar
// con el texto de verdad antes de mandar nada, así que esto nunca decide
// solo si algo se envía.
export function tieneConsentimientoMarketingAlgunaVez(socio: Socio): boolean {
  return !!socio.consentimientoMarketing;
}

// Filtra un array de destinatarias por consentimiento EXACTO, dado un mapa
// socioId → texto aceptado (construido por el caller con un select que SÍ
// trae consentimiento_marketing_texto). Usado por el envío real de
// campañas (lib/inngest/campanas.ts) y de automatizaciones de marketing
// (lib/engines/marketing-automation-engine.ts).
export function filtrarPorConsentimientoMarketing<T extends { id: string }>(
  destinatarias: T[],
  consentimientos: Map<string, string>,
  textoVigente: string,
): T[] {
  return destinatarias.filter(s => tieneConsentimientoMarketingVigente(consentimientos.get(s.id), textoVigente));
}
