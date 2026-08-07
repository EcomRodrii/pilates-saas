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
