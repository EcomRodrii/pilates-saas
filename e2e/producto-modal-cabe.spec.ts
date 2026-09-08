import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «El formulario de un artículo tiene que caber en la pantalla.»
//
// No cabía. El modal usaba el `sheetClassName` por defecto de DashboardSheet,
// que no lleva tope de alto ni scroll propio, así que con este formulario
// —nombre, precio, categoría, descripción, existencias, aviso, IVA, SKU,
// código de barras, activo— crecía más que la ventana. Y como el fondo es
// `fixed inset-0`, no había nada que desplazar: el título, el aspa de cerrar y
// el campo Nombre (obligatorio) quedaban FUERA por arriba. No se podía dar de
// alta un artículo.
//
// Se comprueba en la ventana más baja que se usa de verdad para esto: el iPad
// en horizontal, que es lo que hay en el mostrador.
// ─────────────────────────────────────────────────────────────────────────────

async function abrirNuevoProducto(page: import('@playwright/test').Page) {
  await ir(page, 'productos');
  await page.getByRole('button', { name: 'Productos POS' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /Añadir producto/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nuevo producto' })).toBeVisible();
}

for (const [nombre, alto] of [['iPad apaisado', 768], ['portátil bajo', 700]] as const) {
  test(`el formulario de artículo cabe en la ventana — ${nombre}`, async ({ page }) => {
    await montar(page);
    await page.setViewportSize({ width: 1024, height: alto });
    await abrirNuevoProducto(page);

    const caja = await page.getByRole('dialog', { name: 'Nuevo producto' }).boundingBox();
    expect(caja, 'el modal ni siquiera se ha medido').not.toBeNull();
    expect(caja!.y, 'el modal empieza por encima del borde superior: su cabecera es inalcanzable')
      .toBeGreaterThanOrEqual(0);
    expect(caja!.y + caja!.height, 'el modal termina por debajo del borde inferior')
      .toBeLessThanOrEqual(alto + 1);

    // Y lo que importa de verdad: los dos extremos se pueden usar.
    await expect(page.getByLabel('Nombre *')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear producto' })).toBeVisible();
  });
}

test('la foto se puede elegir y se ve antes de guardar', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await abrirNuevoProducto(page);

  // 1×1 PNG rojo.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByText('Subir foto').click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });

  // El preview vive en un object URL: si no aparece, el fichero no ha entrado.
  const miniatura = page.getByRole('dialog', { name: 'Nuevo producto' }).locator('img').first();
  await expect(miniatura).toBeVisible();
  expect(await miniatura.getAttribute('src')).toContain('blob:');
  await expect(page.getByRole('button', { name: 'Quitar' })).toBeVisible();
});

test('captura del formulario, para mirarlo', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await abrirNuevoProducto(page);
  await page.screenshot({ path: 'test-results/producto-modal.png' });
});
