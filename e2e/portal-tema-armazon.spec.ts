import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El armazón del kit, a tamaño de móvil.
//
// ⚠️ Estos dos fallos NO los ve nada más de la suite: `tsc` y el lint no miden
// píxeles, y los e2e de portal corren contra el portal viejo. Se encontraron
// mirando la previsualización a 375px, y el segundo tuvo que señalarlo el
// fundador después de que yo lo descartara como artefacto de la captura.
// ─────────────────────────────────────────────────────────────────────────────

const MOVIL = { width: 375, height: 812 };

/** Deja el portal abierto en una pantalla concreta sin pasar por la bienvenida. */
async function abrir(page: import('@playwright/test').Page, tema: string, pantalla: string) {
  await page.setViewportSize(MOVIL);
  await page.goto(`/portal-tema-preview/${tema}`);
  await page.evaluate((p) => {
    localStorage.setItem('tentare-portal', JSON.stringify({ screen: p, tab: 'perfil' }));
  }, pantalla);
  await page.reload();
}

test.describe('Armazón del portal del kit', () => {
  // ⚠️ Margen de verdad. La aserción de más abajo espera hasta 30s, que era
  // también el límite POR DEFECTO del test entero — así que nunca podía
  // usarlos: la navegación y el `reload` ya se comen parte, y en una tanda
  // lenta el test moría con un "Test timeout exceeded" opaco antes de que la
  // espera diera de sí. Pasó en CI (E2E 6/6) con un cambio que no tocaba nada
  // de esto; el botón estaba, comprobado en el navegador, 62px.
  //
  // El límite del test va ahora POR ENCIMA del de la aserción a propósito: si
  // el botón falta de verdad, lo que se lee es "element(s) not found" y no un
  // cronómetro.
  test.setTimeout(90_000);

  test('el botón de pago cumple el mínimo táctil aunque la pantalla no quepa', async ({ page }) => {
    // `.canvas` es flex en columna con scroll. Sin `flex-shrink: 0` en sus
    // hijos, el navegador reparte el déficit aplastándolos: con 941px de
    // contenido en 662px de hueco este botón medía 23px — la mitad del mínimo
    // táctil de 44, y es el botón de PAGAR.
    await abrir(page, 'bloom', 'bonos');

    const boton = page.getByRole('button', { name: /Continuar al pago/i });
    await expect(boton).toBeVisible({ timeout: 30_000 });

    const caja = await boton.boundingBox();
    expect(caja, 'el botón de pago no tiene caja').not.toBeNull();
    expect(
      caja!.height,
      `el botón de pago mide ${Math.round(caja!.height)}px: por debajo del mínimo táctil de 44`,
    ).toBeGreaterThanOrEqual(44);
  });

  // ⚠️ AQUÍ FALTA un test del desbordamiento de las barras del progreso, y se
  // deja escrito a propósito en vez de dejar uno que no sirve.
  //
  // El fallo es real y está arreglado en `06-home.css`: `.bars` tenía
  // `height: 34px` —la altura de la barra más alta, no la de la columna— y el
  // sobrante se metía encima de «0 de 4 clases». Pero las dos aserciones que
  // escribí para fijarlo PASABAN CON EL FALLO PUESTO (comprobado saboteando el
  // CSS y volviendo a ejecutar), así que no protegían nada.
  //
  // Un test verde que no cae al reintroducir el bug es peor que no tenerlo:
  // da permiso para romperlo. Queda pendiente de escribirlo bien.

  test('a tamaño de móvil no se pinta una barra de estado falsa', async ({ page }) => {
    // El marco de teléfono desaparece por debajo de 900px, pero la barra seguía
    // dibujando "9:41" y la señal encima de las de verdad del móvil. El HUECO sí
    // hace falta (safe-area); lo que sobra es el decorado.
    await abrir(page, 'oliva', 'inicio');

    // ⚠️ `toHaveCount(0)` NO vale: el nodo sigue en el DOM, lo que se apaga es su
    // `display`. Hay que preguntar por visibilidad o el test pasa en verde con
    // la hora falsa pintada en la cara de la socia.
    await expect(page.getByText('9:41')).toBeHidden();

    const alto = await page.locator('.status-bar').evaluate((n) => n.getBoundingClientRect().height);
    expect(alto, 'el hueco de la safe-area no debe desaparecer, solo su contenido').toBeGreaterThan(0);
  });
});
