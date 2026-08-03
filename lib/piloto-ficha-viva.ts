// Piloto de validación de captura de notas por voz (Ficha Viva) — 6 semanas,
// 10 instructoras reales. Ver informe estratégico ago-2026 (memoria de sesión):
// es la prueba de falsación nº2 antes de comprometer roadmap a la memoria
// institucional — si la tasa de captura real por clase cae por debajo del
// 60%, replantear toda la estrategia.
//
// Config estática a propósito: es un experimento de 6 semanas, no una
// feature de producto — no justifica una pantalla de settings. Se borra
// (este archivo y sus usos) al cerrar el piloto.

// Las 5 instructoras activas reales de studio-1 (único estudio real
// documentado, ver memoria "datos-sembrados-estudio-real"). studio-1 no
// tiene 10 instructoras activas hoy — quedan otras 3 fichas (seed-dep-ins-*)
// pero son fixtures de demo, inactivas y sin auth_user_id: nunca podrían
// iniciar sesión ni activar el piloto.
// TODO: completar hasta 10 cuando haya más equipo real, o decidir si el
// piloto arranca con estas 5 (studio-1, consultado 2026-08-03):
//   ins-2                     Julia Ramos
//   ins-1783388201942-cq6dx   maria
//   ins-1                     María Soler
//   ins-1783478442553-yksed   Meri
//   ins-mrtoe0vt-1-9qn6b      Rosi
export const INSTRUCTORAS_PILOTO_VOZ: string[] = [
  'ins-2',
  'ins-1783388201942-cq6dx',
  'ins-1',
  'ins-1783478442553-yksed',
  'ins-mrtoe0vt-1-9qn6b',
];

export const PILOTO_VOZ_INICIO = '2026-08-04';
export const PILOTO_VOZ_FIN = '2026-09-15';

export function enPilotoVoz(instructorId: string | null | undefined): boolean {
  if (!instructorId) return false;
  return INSTRUCTORAS_PILOTO_VOZ.includes(instructorId);
}
