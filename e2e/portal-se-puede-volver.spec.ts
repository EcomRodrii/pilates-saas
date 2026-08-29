import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// De toda pantalla se puede volver.
//
// El bug original (CALLEJÓN SIN SALIDA, encontrado por el fundador usándola)
// vivía en el router propio del KIT: `ir()`/`navegar()`
// (`components/portal-tema/`) mantenían su propia pila de pantallas por
// encima de Next.js, y una pantalla sin ruta URL propia (Favoritas,
// Historial) podía dejar la flecha «Atrás» sin hacer nada porque la URL ya
// era la misma. Ese router es exclusivo del kit — el portal de siempre
// navega con `<Link>`/`router.back()` de Next.js de verdad, así que esa
// clase de bug (URL igual, pantalla distinta, "atrás" no navega) no puede
// pasar aquí: no hay una pila propia que desincronizar de la URL.
//
// Lo que SÍ es una pregunta real y equivalente en el portal de siempre es si
// una pantalla que NO está en la barra de abajo (detalle de clase, alcanzado
// desde "Huecos de hoy" en Hoy) tiene una vuelta real y no deja a la socia
// atascada. Este fichero migra esa pregunta a `router.back()`, que es el
// mecanismo real que usa `app/portal/[slug]/clases/[sesionId]/page.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('desde el detalle de una clase (llegando por Hoy) se puede volver', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible({ timeout: 60_000 });

  // La fila de "Huecos de hoy" de ses-1 (Reformer Flow, dentro de ~3h) es un
  // <Link> real de Next — no un botón del router propio del kit. El carrusel
  // "Esta semana" que antes también podía llevar aquí ya no existe (rediseño
  // "Tentare Studio App"): "Huecos de hoy" es la única vía real que queda.
  await page.locator(`a[href="/portal/${SLUG}/clases/ses-1"]`).first().click();
  await expect(page.getByRole('heading', { name: 'Reformer Flow' })).toBeVisible({ timeout: 30_000 });

  // El botón de volver de esta pantalla no lleva `aria-label` (solo un icono):
  // es el primer botón del documento, antes de cualquier otro control de la
  // ficha (favorita, gráfica...).
  await page.locator('button').first().click();

  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home$`));
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
});
