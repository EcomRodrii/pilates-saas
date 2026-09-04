import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// `app/widget-bundle/widget.css` duplica A MANO las clases que
// `app/globals.css` da por Tailwind, porque el bundle embebido lo compila
// esbuild sin Tailwind ni PostCSS. La duplicación es deliberada y está
// documentada en la cabecera del propio widget.css.
//
// Lo que NO era deliberado es que no hubiera ninguna red que avisara al
// divergir. Una clase `reserva-*`/`animate-*` que se añade a globals y no a
// widget.css no rompe nada visible en CI: simplemente el widget incrustado en
// la web del estudio —el que de verdad usa el cliente— se ve distinto del
// alojado, y nadie se entera hasta que lo ve un ojo humano.
//
// Este test compara las dos copias por NOMBRE de clase y keyframe. No compara
// las declaraciones: `:host` obliga a escribir algunas reglas distintas a
// propósito, y exigir texto idéntico daría falsos rojos constantes.
// ─────────────────────────────────────────────────────────────────────────────

const raiz = join(import.meta.dirname, '..', '..');
const globals = readFileSync(join(raiz, 'app/globals.css'), 'utf8');
const widget = readFileSync(join(raiz, 'app/widget-bundle/widget.css'), 'utf8');

/** Los nombres de clase `reserva-*` / `animate-*` que define una hoja. */
function clasesDe(css: string): Set<string> {
  return new Set([...css.matchAll(/\.((?:reserva|animate)-[a-z0-9-]+)/g)].map(m => m[1]));
}

/** Los `@keyframes` que define una hoja. */
function keyframesDe(css: string): Set<string> {
  return new Set([...css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map(m => m[1]));
}

// Las que viven SOLO en pantallas que nunca entran en el bundle. Cada
// excepción va con su motivo: si alguna vez uno de esos componentes se usa en
// Modo B, este test tiene que volverse rojo, y para eso la lista debe ser
// corta y estar justificada.
const SOLO_MODO_A = new Set([
  // `PublicSheet` y los pasos del modal viven en app/reservar/[slug]/page.tsx,
  // que es una página de Next: no la compila esbuild. Entrada y salida.
  'animate-sheet-pop-in', 'animate-sheet-pop-out', 'animate-sheet-backdrop-out',
  // La hoja a sangre en móvil de PublicSheet — mismo motivo, solo Modo A.
  'reserva-modal-edge',
  // La altura estable de la hoja en móvil se aplica SOLO fuera del embebido
  // (dentro manda la franja visible del iframe), así que en el bundle no
  // pintaría nada aunque estuviera.
  'reserva-hoja-estable',
  // La portada de /reservar solo existe FUERA del embebido (`!embedMode`), así
  // que sus clases no tienen nada que hacer en el bundle.
  'reserva-hero-foto', 'reserva-hero-portada', 'reserva-tabs',
  // La tira de pestañas (#horario) solo existe en app/reservar/[slug]/page.tsx.
  'reserva-tabs-scroll',
  // Pantalla de reserva a sangre completa (Fase 2 del rediseño) — monta
  // dentro de PublicSheet, que solo vive en app/reservar/[slug]/page.tsx.
  'reserva-pantalla-completa', 'reserva-pantalla-completa-hoja',
  // `components/ui/dashboard-drawer.tsx` — cajón del PANEL, tras login. El
  // bundle público no lo incluye ni puede incluirlo.
  'animate-drawer-sheet-in', 'animate-drawer-sheet-out',
  'animate-drawer-backdrop-in', 'animate-drawer-backdrop-out',
  // `components/layout/whatsapp-fab.tsx` — botón flotante del panel.
  'animate-wa-fab-ring',
  // Icono de éxito del paso 'done' (diseño "Tentare Portal Reservas": anillo +
  // check + confeti) — vive en el mismo `loginStep === 'done'` de
  // app/reservar/[slug]/page.tsx que ya justifica el resto de esta lista.
  'reserva-check-ring', 'reserva-check-pop',
  'reserva-confeti-a', 'reserva-confeti-b1', 'reserva-confeti-c', 'reserva-confeti-b2',
]);

test('toda clase reserva-*/animate-* de globals.css existe también en widget.css', () => {
  const faltan = [...clasesDe(globals)]
    .filter(c => !SOLO_MODO_A.has(c))
    .filter(c => !clasesDe(widget).has(c));
  assert.deepEqual(faltan, [], `Clases que el widget embebido NO tiene: ${faltan.join(', ')}`);
});

test('todo @keyframes usado por esas clases existe en las dos copias', () => {
  // Solo los keyframes de la familia del widget: globals tiene además los de
  // la landing, el dashboard y el portal, que no pintan nada aquí.
  const nuestros = [...keyframesDe(globals)].filter(k => /^(reserva|sheet|widget-skeleton)-/.test(k));
  const faltan = nuestros
    // Los de `PublicSheet`: mismo motivo que su clase en SOLO_MODO_A.
    .filter(k => !['sheet-pop-in', 'sheet-pop-out', 'sheet-backdrop-out'].includes(k))
    // Los del icono de éxito del paso 'done' — mismo motivo que sus clases.
    .filter(k => !['reserva-check-ring', 'reserva-check-pop', 'reserva-confeti-a', 'reserva-confeti-b', 'reserva-confeti-c'].includes(k))
    .filter(k => !keyframesDe(widget).has(k));
  assert.deepEqual(faltan, [], `Keyframes que el widget embebido NO tiene: ${faltan.join(', ')}`);
});

test('las dos copias respetan «reducir movimiento» con las MISMAS reglas', () => {
  // La divergencia real que encontró la auditoría: a widget.css le faltaba
  // `scroll-behavior`, y la tira de días hace `scrollBy({behavior:'smooth'})`.
  for (const propiedad of ['animation-duration', 'animation-iteration-count', 'transition-duration', 'scroll-behavior']) {
    assert.ok(globals.includes(propiedad), `globals.css sin ${propiedad} en reduced-motion`);
    assert.ok(widget.includes(propiedad), `widget.css sin ${propiedad} en reduced-motion`);
  }
});
