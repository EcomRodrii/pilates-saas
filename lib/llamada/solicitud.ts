// ─────────────────────────────────────────────────────────────────────────────
// Las llamadas de puesta en marcha que ya se pidieron.
//
// 21-oct-2026: el asistente de bienvenida ya NO ofrece que la llamen ni que le
// configuren el estudio (decisión del fundador: nadie llama a los estudios ni
// los configura por ellos). No se crea ninguna solicitud nueva y
// `/api/onboarding/ayuda-alta` contesta 410. Lo que queda aquí es lo que
// necesita /interno/llamadas para atender las que ya están en
// `solicitudes_llamada`, que no se borran.
//
// Puro y sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export const HORAS_PREFERIDAS = ['manana', 'tarde'] as const;
export type HoraPreferida = (typeof HORAS_PREFERIDAS)[number];
export const ETIQUETA_HORA: Record<HoraPreferida, string> = { manana: 'Por la mañana', tarde: 'Por la tarde' };
