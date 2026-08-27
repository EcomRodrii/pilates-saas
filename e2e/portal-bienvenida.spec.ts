import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La raíz del portal, `/portal/<slug>` a secas.
//
// Esto llegó a montar la bienvenida del KIT (un tema instalable de
// `components/portal-tema/`) — con `esTemaPortal()` cerrado para siempre
// (fix(portal): cierra el acceso a los temas del kit), esa pantalla ya no se
// alcanza NUNCA: `PortalRaiz` (components/portal/portal-raiz.tsx) resuelve
// `sinKit` a `true` siempre que hay datos cargados y no hay sesión, y salta
// directa a `/acceso` sin pasar por ningún paso intermedio.
//
// Lo que SÍ sigue siendo del portal de siempre, y es lo que protege este
// fichero: la raíz acaba en `/acceso` para quien no tiene sesión —el enlace
// pelado que comparte el estudio por WhatsApp funciona igual con o sin
// contraseña—, y quien SÍ tiene sesión no ve absolutamente nada de la raíz:
// `PortalShell` la manda directa a `/home`.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('sin sesión, la raíz acaba en /acceso', async ({ page }) => {
  await montarPortal(page, { conSesion: false });
  await page.goto(`/portal/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso`), { timeout: 30_000 });
});

test('quien ya tiene sesión no pasa por la raíz: va directa a /home', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home`), { timeout: 60_000 });
});
