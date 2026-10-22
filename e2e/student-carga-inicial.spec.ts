import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Lo que pide la app de la alumna al abrirse en frío.
//
// El punto de la campana se traía la bandeja entera (60 avisos con título y
// cuerpo) para quedarse con un número. Ahora pide solo el conteo.
//
// (Aquí había también la prueba de que Inicio precargaba su portada en el
// `<head>`. Desde la maqueta de oct-2026, copiada tal cual por decisión del
// fundador, Inicio no tiene portada: la prueba ya no mide nada.)

test('la campana cuenta los avisos sin traerse la bandeja', async ({ page }) => {
  test.setTimeout(120_000);
  await sembrarSociaCompleta(page, { bono: 5 });

  const pedidas: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/notifications' && r.method() === 'GET') pedidas.push(u.search);
  });
  // Registrada DESPUÉS del andamiaje, así que manda sobre su mock. Contesta
  // solo `{ unread }`, como el servidor: si el cliente volviera a contar sobre
  // `items`, el punto no se encendería.
  await page.route(
    (u) => u.pathname === '/api/notifications' && u.searchParams.get('soloConteo') === '1',
    (r) => r.fulfill({ json: { unread: 2 } }),
  );

  // En Inicio: Reservar y Mi plan van sin la barra del estudio, como en la maqueta.
  await page.goto(`/portal/${SLUG}`);
  await expect(page.getByRole('link', { name: 'Notificaciones, 2 sin leer', exact: true })).toBeVisible({ timeout: 30_000 });
  expect(pedidas.length).toBeGreaterThan(0);
  expect(pedidas.filter((q) => new URLSearchParams(q).get('soloConteo') !== '1'), 'pidió la bandeja entera').toEqual([]);
});
