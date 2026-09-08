import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Todas las pantallas del panel empiezan en la misma línea.»
//
// Salió de medir, no de mirar: el borde izquierdo del contenido coincidía en
// 19 pantallas y en dos no. La Libreta y Traer mis datos se envolvían en un
// `mx-auto` propio, sin caer en que `DashboardShell` YA centra el panel entero
// en 1320 px — así que centraban una caja dentro de otra ya centrada y su
// título quedaba ~180 px a la derecha del de todas las demás. Al navegar entre
// ellas y cualquier otra, el título saltaba.
//
// Se comprueba contra una pantalla de REFERENCIA, no contra un número fijo: si
// algún día cambia el ancho del menú o el padding del contenedor, esto tiene
// que seguir pasando, no romperse en las veinte a la vez.
//
// ⚠️ Un `max-w-*` sin `mx-auto` está BIEN y no lo rompe: acotar el ancho de
// lectura no mueve el margen izquierdo. Lo que se prohíbe es volver a centrar.
// ─────────────────────────────────────────────────────────────────────────────

const REFERENCIA = 'clientas';
const A_COMPROBAR = ['libreta', 'migracion', 'informes', 'equipo'];

async function bordeDelTitulo(page: import('@playwright/test').Page, ruta: string) {
  await ir(page, ruta);
  const h1 = page.locator('h1').first();
  await expect(h1, `${ruta} no llegó a pintar su título`).toBeVisible({ timeout: 20_000 });
  const caja = await h1.boundingBox();
  expect(caja, `${ruta}: el título no se pudo medir`).not.toBeNull();
  return Math.round(caja!.x);
}

test('el título empieza en el mismo sitio en todas las pantallas', async ({ page }) => {
  test.setTimeout(120_000);
  await montar(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  const esperado = await bordeDelTitulo(page, REFERENCIA);

  for (const ruta of A_COMPROBAR) {
    const x = await bordeDelTitulo(page, ruta);
    expect(
      x,
      `/${ruta} empieza en ${x} px y /${REFERENCIA} en ${esperado} px: ${Math.abs(x - esperado)} px de salto al navegar`,
    ).toBe(esperado);
  }
});
