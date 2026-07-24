// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FREEZE — fase Product-Market Fit (2026-07-23)
// ═══════════════════════════════════════════════════════════════════════════
//
// Cuatro módulos se CONGELAN para centrar el producto en el flujo principal de
// un estudio de Pilates. Congelar ≠ borrar: el código, las páginas, los hooks,
// las APIs, las tablas, las migraciones y los datos SIGUEN INTACTOS. Solo se
// desconectan del flujo principal para que el usuario no sepa que existen.
//
//   · Kiosko    → /kiosk/*            (pantalla de check-in en tablet)
//   · POS/Caja  → /pos                (punto de venta / TPV / datáfono)
//   · VOD       → /ondemand  +  el "Vídeos" del portal de socias
//   · Comunidad → /comunidad          (posts, likes, comentarios)
//   · Chat      → /chat               (chat de equipo — RLS roto D2 + no es la cuña)
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
//   3. Volver a añadir su entrada de menú en lib/nav-config.tsx y su permiso en
//      lib/permisos.ts si se quitaron (ver comentarios "CONGELADO" allí).
//   Para el "Vídeos" del portal: poner PORTAL_VIDEOS_CONGELADO a false.
//
// Detalle completo en docs/FEATURE-FREEZE-2026-07.md.

/** Prefijos de ruta congelados. Un prefijo cubre la ruta exacta y sus subrutas. */
export const RUTAS_CONGELADAS = [
  '/kiosk',
  '/pos',
  '/ondemand',
  '/comunidad',
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
