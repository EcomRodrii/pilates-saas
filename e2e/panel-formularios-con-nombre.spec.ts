import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// Dos cosas que el barrido de usabilidad (5-nov-2026) midió en el panel y que ninguna prueba vigilaba:
//  · «Mi perfil»: las etiquetas eran párrafos, no <label>. Un lector de pantalla no sabía qué era cada campo y tocar el
//    texto no enfocaba el campo. Ahora cada campo se alcanza por su etiqueta.
//  · «Libreta de clientas» en el móvil: la tabla de cinco columnas era más ancha que la pantalla y ensanchaba TODA la
//    página (+65 px a 390). Ahora se desplaza dentro de su hoja.

test.describe.configure({ timeout: 90_000 });

test('Mi perfil: cada campo tiene su etiqueta asociada (se alcanza por ella y al tocarla se enfoca)', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await ir(page, 'mi-perfil');
  for (const etiqueta of ['Nombre', 'Email', 'Teléfono']) {
    const campo = page.getByLabel(etiqueta, { exact: true });
    await expect(campo, `«${etiqueta}» sin <label>`).toHaveCount(1);
    await page.locator('label', { hasText: new RegExp(`^${etiqueta}$`) }).click();
    await expect(campo).toBeFocused();
  }
});

test('Libreta en el móvil: la tabla se desplaza dentro de su hoja y la página no se ensancha', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await ir(page, 'libreta');
  const tabla = page.locator('.libreta-doc table');
  await expect(tabla, 'la libreta sembrada debe tener su tabla').toHaveCount(1);
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(2);
});
