import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// A la puerta se llega ENTERA, en el móvil que sea.
//
// ⚠️ Al unificar el acceso en UNA sola pantalla (email + contraseña + Google +
// «no tengo contraseña»), la puerta pasó a medir 863 px. Y las pantallas de
// puerta cuelgan directas de `FRAME` en `portal-shell.tsx`, que recorta con
// `overflow: hidden` y no tiene dónde rodar —las pantallas del portal sí lo
// tienen, en su `<main className="overflow-y-auto">`—. En un iPhone SE (667)
// el botón de Google y la salida por correo quedaban FUERA y sin forma de
// llegar: medido, `scrollY` seguía en 0 después de rodar 600 px.
//
// Mientras el acceso fueron dos pasos cortos esto no se notaba, así que no es
// un fallo del rediseño: es un recorte que llevaba ahí desde antes y que la
// pantalla única destapó. Volverá en cuanto alguien añada una línea más, y por
// eso se ata aquí en vez de confiar en que quepa.
//
// Se comprueba en los tres tamaños que importan, no en uno: el SE es el suelo
// real que sigue habiendo por ahí, y el Android de 360×780 es el ancho más
// estrecho — donde el rótulo largo del enlace envuelve a dos líneas.
// ─────────────────────────────────────────────────────────────────────────────

const MOVILES = [
  { nombre: 'iPhone SE', w: 375, h: 667 },
  { nombre: 'iPhone 14', w: 390, h: 844 },
  { nombre: 'Android estrecho', w: 360, h: 780 },
] as const;

test.setTimeout(180_000);

for (const movil of MOVILES) {
  test(`en ${movil.nombre} se alcanzan las tres salidas de la puerta`, async ({ page }) => {
    await montarPortal(page, { conSesion: false, kit: 'sereno' });
    await page.setViewportSize({ width: movil.w, height: movil.h });
    await page.goto(`/portal/${SLUG}/acceso`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // La puerta reconstruida (816f4971) aterriza primero en el paso `intro`
    // ("Muévete. Lo demás, ya está.") — el formulario con las tres salidas
    // que este test mide vive en el paso `login`, al que se llega pulsando
    // "Ya tengo cuenta". El recorte que este test protege es del paso
    // `login` en sí, no de la portada.
    await expect(page.getByText('Muévete. Lo demás, ya está.')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 60_000 });

    // Las tres formas de entrar. Ninguna puede quedar fuera de alcance: la que
    // se quede fuera deja sin puerta justo a quien la necesitaba.
    for (const salida of [
      page.getByRole('button', { name: 'Entrar' }),
      page.getByRole('button', { name: /continuar con google/i }),
      page.getByRole('button', { name: /mándame un enlace/i }),
    ]) {
      await salida.scrollIntoViewIfNeeded();
      // `toBeInViewport` mira la posición REAL tras rodar: si el contenedor no
      // deja rodar —que era el bug—, `scrollIntoViewIfNeeded` no hace nada y
      // esto falla, que es exactamente lo que tiene que pasar.
      await expect(salida).toBeInViewport();
    }
  });
}
