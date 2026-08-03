// Piloto de validación de captura de notas por voz (Ficha Viva) — 6 semanas,
// 10 instructoras reales. Ver informe estratégico ago-2026 (memoria de sesión):
// es la prueba de falsación nº2 antes de comprometer roadmap a la memoria
// institucional — si la tasa de captura real por clase cae por debajo del
// 60%, replantear toda la estrategia.
//
// Config estática a propósito: es un experimento de 6 semanas, no una
// feature de producto — no justifica una pantalla de settings. Se borra
// (este archivo y sus usos) al cerrar el piloto.

// TODO: rellenar con los IDs reales de las 10 instructoras del piloto antes de arrancarlo.
export const INSTRUCTORAS_PILOTO_VOZ: string[] = [];

export const PILOTO_VOZ_INICIO = '2026-08-04';
export const PILOTO_VOZ_FIN = '2026-09-15';

export function enPilotoVoz(instructorId: string | null | undefined): boolean {
  if (!instructorId) return false;
  return INSTRUCTORAS_PILOTO_VOZ.includes(instructorId);
}
