// Interruptores de funcionalidad.
//
// MARKETING_MODULE_ENABLED: oculta TEMPORALMENTE todo el trabajo de marketing
// —el módulo Contenido (/contenido: panel, calendario, biblioteca, ideas,
// métricas, guiones IA, carruseles IA) y el módulo Marketing del estudio
// (/marketing, incluidas las mejoras de Fase 7)—. Con `false`:
//   · se quitan sus entradas del menú lateral (lib/nav-config.tsx), y
//   · sus rutas redirigen a /dashboard (guards en los layouts/páginas).
// El código permanece intacto: para reactivarlo, poner `true`.
export const MARKETING_MODULE_ENABLED = false;
