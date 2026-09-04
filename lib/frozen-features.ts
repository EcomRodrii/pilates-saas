// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FREEZE — fase Product-Market Fit (2026-07-23)
// ═══════════════════════════════════════════════════════════════════════════
//
// Tres módulos siguen CONGELADOS para centrar el producto en el flujo
// principal de un estudio de Pilates. Congelar ≠ borrar: el código, las
// páginas, los hooks, las APIs, las tablas, las migraciones y los datos
// SIGUEN INTACTOS. Solo se desconectan del flujo principal para que el
// usuario no sepa que existen.
//
//   · Kiosko    → /kiosk/*            (pantalla de check-in en tablet)
//   · POS/Caja  → /pos                (punto de venta / TPV / datáfono)
//   · VOD       → /ondemand  +  el "Vídeos" del portal de socias
//   · Chat      → /chat               (chat de equipo — RLS roto D2 + no es la cuña)
//
// Comunidad se REACTIVÓ (P1, Community & Messaging OS, ver
// docs/community-os-diseno-p0.md/community-messaging-os-freeze-levantado):
// decisión explícita del usuario, no una reversión de este documento.
//
// Fuente única de verdad del freeze. Un solo interruptor gobierna: menú lateral,
// barra inferior, cajón "Más", editor de menú, buscador/paleta ⌘K y el guardia
// de rutas del panel (todos filtran por `esRutaCongelada`/`puedeVer`). Las rutas
// además tienen un stub de servidor (redirect/404) para no pintar nunca la
// página, ni siquiera por un instante.
//
// Es INDEPENDIENTE de MARKETING_MODULE_ENABLED a propósito: aunque se reactive
// el módulo de marketing, estos cuatro siguen congelados hasta que se decida lo
// contrario aquí.
//
// ─── CÓMO REACTIVAR UN MÓDULO (pocos cambios) ───────────────────────────────
//   1. Quitar su prefijo de RUTAS_CONGELADAS (abajo).
//   2. Restaurar su ruta: renombrar `page.frozen.tsx` → `page.tsx` (y en kiosk
//      también `layout.frozen.tsx` → `layout.tsx`), borrando el stub.
//   3. Volver a añadir su entrada de menú en lib/nav-config.ts y su permiso en
//      lib/permisos.ts si se quitaron (ver comentarios "CONGELADO" allí).
//   Para el "Vídeos" del portal: poner PORTAL_VIDEOS_CONGELADO a false.
//   ⚠️ SOLO PARA /chat: volver a meter la tabla en la publicación de Realtime
//      (`alter publication supabase_realtime add table public.mensajes_equipo;`).
//      Se sacó por coste — Realtime era el 58 % del CPU de la BD y esta tabla
//      pagaba WAL por una feature inalcanzable (migr 20260806150000). Sin este
//      paso el chat NO da error: los mensajes simplemente no llegan en vivo,
//      que es justo el tipo de fallo mudo que no se descubre solo.
//
// Detalle completo en docs/FEATURE-FREEZE-2026-07.md.

/** Prefijos de ruta congelados. Un prefijo cubre la ruta exacta y sus subrutas. */
export const RUTAS_CONGELADAS = [
  '/kiosk',
  '/pos',
  '/ondemand',
  '/chat',
] as const;

/**
 * ¿La ruta pertenece a un módulo congelado? Coincidencia por prefijo de
 * segmento: `/pos` y `/pos/loquesea` cuentan; `/productos` NO (no es subruta de
 * `/pos`). Se usa en permisos, navegación, buscador y guardias de ruta.
 */
export function esRutaCongelada(path: string): boolean {
  const limpio = path.split('?')[0];
  return RUTAS_CONGELADAS.some((p) => limpio === p || limpio.startsWith(`${p}/`));
}

/**
 * El "Vídeos" del portal de socias es el lado consumidor de VOD/On Demand. Se
 * gobierna con su propio interruptor (la ruta del portal no vive bajo los
 * prefijos de arriba). Poner a false para reactivarlo junto con /ondemand.
 */
export const PORTAL_VIDEOS_CONGELADO = true;
