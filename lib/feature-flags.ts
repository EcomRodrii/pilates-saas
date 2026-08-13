// ⚠️⚠️⚠️  MENSAJE PARA CLAUDE (y para cualquier IA/dev)  ⚠️⚠️⚠️
// ─────────────────────────────────────────────────────────────────────────────
// REACTIVADO el 2026-08-13 por decisión EXPLÍCITA de Marcos (paso 1 de
// docs/marketing-integrations-arquitectura.md §8, tras cerrar los pasos 2-6:
// dedup del solape de motores, Provider Layer, cola server-side de campañas,
// consentimiento RGPD, segmentación ampliada). Si en el futuro hace falta
// volver a apagarlo, hazlo con el mismo criterio: solo si Marcos lo pide
// explícitamente, no por iniciativa propia.
// ─────────────────────────────────────────────────────────────────────────────
//
// MARKETING_MODULE_ENABLED: con `false` ocultaba TEMPORALMENTE todo el trabajo
// de marketing, MANTENIENDO EL CÓDIGO (menú + rutas redirigen) tanto en el
// panel de gestión (staff) como en la app del cliente (portal de socios):
//   · Módulo Contenido            → /contenido/* (panel, calendario, biblioteca,
//                                    ideas, métricas)
//   · Módulo Marketing del estudio → /marketing (incl. mejoras de Fase 7)
//
// NOTA: la Oferta digital (on-demand) sigue sin depender de este flag. Se
// congeló aparte en el feature-freeze PMF (lib/frozen-features.ts): /ondemand
// (staff) y el "Vídeos" del portal se gobiernan allí (RUTAS_CONGELADAS y
// PORTAL_VIDEOS_CONGELADO), y siguen ocultos con este flag ya reactivado.
export const MARKETING_MODULE_ENABLED = true;
