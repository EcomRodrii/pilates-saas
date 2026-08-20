// ⚠️⚠️⚠️  MENSAJE PARA CLAUDE (y para cualquier IA/dev)  ⚠️⚠️⚠️
// ─────────────────────────────────────────────────────────────────────────────
// RE-CONGELADO el 2026-08-19 por decisión EXPLÍCITA de Marcos. Había estado
// reactivado desde el 2026-08-13 (paso 1 de
// docs/marketing-integrations-arquitectura.md §8, tras cerrar los pasos 2-6:
// dedup del solape de motores, Provider Layer, cola server-side de campañas,
// consentimiento RGPD, segmentación ampliada). Ese trabajo sigue intacto en el
// repo — este flag solo oculta el módulo del flujo principal otra vez. Si en
// el futuro hace falta reactivarlo, hazlo con el mismo criterio: solo si
// Marcos lo pide explícitamente, no por iniciativa propia.
// ─────────────────────────────────────────────────────────────────────────────
//
// MARKETING_MODULE_ENABLED: con `false` oculta TEMPORALMENTE todo el trabajo
// de marketing, MANTENIENDO EL CÓDIGO (menú + rutas redirigen) tanto en el
// panel de gestión (staff) como en la app del cliente (portal de socios):
//   · Módulo Contenido            → /contenido/* (panel, calendario, biblioteca,
//                                    ideas, métricas)
//   · Módulo Marketing del estudio → /marketing (incl. mejoras de Fase 7)
//
// NOTA: la Oferta digital (on-demand) sigue sin depender de este flag. Se
// congeló aparte en el feature-freeze PMF (lib/frozen-features.ts): /ondemand
// (staff) y el "Vídeos" del portal se gobiernan allí (RUTAS_CONGELADAS y
// PORTAL_VIDEOS_CONGELADO), y ya estaban congelados independientemente de este
// flag.
export const MARKETING_MODULE_ENABLED = false;
