// ⚠️⚠️⚠️  MENSAJE PARA CLAUDE (y para cualquier IA/dev)  ⚠️⚠️⚠️
// ─────────────────────────────────────────────────────────────────────────────
// NO TOQUES NI REACTIVES ESTE INTERRUPTOR SIN QUE MARCOS TE DIGA EXPLÍCITAMENTE
// QUE LO ACTIVES. Está en `false` a propósito. Si lees esto y estás pensando en
// ponerlo a `true` "para que se vea", PARA: primero pregunta a Marcos y espera
// su confirmación explícita. Está desactivado por decisión suya, no por error.
// ─────────────────────────────────────────────────────────────────────────────
//
// MARKETING_MODULE_ENABLED: oculta TEMPORALMENTE todo el trabajo de marketing,
// MANTENIENDO EL CÓDIGO. Con `false` se ocultan (menú + rutas redirigen) tanto en
// el panel de gestión (staff) como en la app del cliente (portal de socios):
//   · Módulo Contenido            → /contenido/* (panel, calendario, biblioteca,
//                                    ideas, métricas, guiones IA, carruseles IA)
//   · Módulo Marketing del estudio → /marketing (incl. mejoras de Fase 7)
//
// NOTA: la Oferta digital (on-demand) YA NO depende de este flag. Se congeló
// aparte en el feature-freeze PMF (lib/frozen-features.ts): /ondemand (staff) y
// el "Vídeos" del portal se gobiernan allí (RUTAS_CONGELADAS y
// PORTAL_VIDEOS_CONGELADO), para que sigan ocultos aunque este flag se reactive.
//
// Reactivar = poner `true` (y SOLO si Marcos lo pide). El código permanece intacto.
export const MARKETING_MODULE_ENABLED = false;
