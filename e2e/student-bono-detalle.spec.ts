import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La ficha de un bono — la pantalla donde la alumna mira qué le queda de lo que
// pagó.
//
// ⚠️ Existe por un bug que solo se ve MIRANDO la pantalla entera: la ficha
// listaba «Sesiones usadas» filtrando `reservas` por `r.bonoId`, un campo que
// NO ESCRIBE NADIE en todo el repo (el único `bonoId` se pone en un `Pago`, no
// en una `Reserva`; `reservas` no guarda con qué se pagó). El filtro no casaba
// nunca, así que la sección salía SIEMPRE con «Todavía no has usado ninguna
// sesión de este bono» — tres líneas por debajo de «Usadas / total: 3 / 8».
//
// Ningún test lo veía porque cada aserción miraba UNA frase. Este compara las
// afirmaciones de la pantalla ENTRE SÍ, que es lo que fallaba.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { total?: number; restantes?: number } = {}) {
  const { total = 8, restantes = 5 } = opts;
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: `Bono ${total} sesiones`, tipo: 'BONO', sesiones: total, precio: 96, activo: true }];
  const socia = f.socia as Record<string, unknown>;
  socia.suscripciones = [{
    id: 'sus-1', socioId: SOCIO_ID, studioId: STUDIO_ID, planId: 'plan-bono', estado: 'ACTIVA',
    sesionesRestantes: restantes, fechaInicio: '2026-07-01', fechaFin: '2026-09-30', creadoEn: '2026-07-01T10:00:00Z',
  }];
  socia.recibos = [{
    id: 'rec-1', socioId: SOCIO_ID, studioId: STUDIO_ID, concepto: `Bono ${total} sesiones`, importe: 96,
    estado: 'COBRADO', fechaCobro: '2026-07-01', metodoCobro: 'Tarjeta', suscripcionId: 'sus-1',
  }];
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
}

test.describe('Student PWA · ficha de un bono', () => {
  test.describe.configure({ timeout: 120_000 });

  test('la pantalla no se contradice sobre cuántas sesiones ha gastado', async ({ page }) => {
    await montar(page, { total: 8, restantes: 5 });
    await page.goto(`${base}/bonos/sus-1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Usadas / total')).toBeVisible({ timeout: 30_000 });

    const texto = await page.locator('body').innerText();
    // Lo que de verdad falló: decir 3 usadas y 0 usadas en la misma pantalla.
    expect(texto).toContain('3 / 8');
    expect(texto, 'la ficha vuelve a afirmar que no ha usado ninguna, con 3 gastadas')
      .not.toMatch(/no has usado ninguna/i);
  });

  test('«5 de 8» decía lo contrario de lo que parecía: son las que QUEDAN', async ({ page }) => {
    // La barra se llena con lo que queda (medidor de depósito), así que
    // «5 de 8 sesiones» se leía como «llevo 5 hechas de 8» — justo al revés.
    await montar(page, { total: 8, restantes: 5 });
    await page.goto(`${base}/bonos/sus-1`, { waitUntil: 'domcontentloaded' });
    // La frase se reparte en tres líneas desde que la cifra va en grande
    // (`--t-display`), pero dice lo mismo y en el mismo orden: el verbo
    // ANTES del número es lo que impide volver a leer «llevo 5 hechas».
    await expect(page.getByText('Te quedan')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('bono-restantes')).toHaveText('5');
    await expect(page.getByText('de 8 sesiones')).toBeVisible();
  });

  test('el nombre del bono se dice UNA vez, no en el título y en la tarjeta', async ({ page }) => {
    // Las tres fichas de la app se titulan igual de genérico —«Recibo»,
    // «Tu reserva», «Tu bono»— y dejan que la tarjeta nombre la cosa. Esta
    // era la única que ponía el nombre arriba Y debajo, a dos filas.
    await montar(page, { total: 8, restantes: 5 });
    await page.goto(`${base}/bonos/sus-1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Tu bono' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Bono 8 sesiones')).toHaveCount(1);
  });

  test('un bono recién comprado dice que no ha gastado nada, sin inventarse una lista', async ({ page }) => {
    await montar(page, { total: 8, restantes: 8 });
    await page.goto(`${base}/bonos/sus-1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Te quedan')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('bono-restantes')).toHaveText('8');
    await expect(page.getByText('de 8 sesiones')).toBeVisible();
    const texto = await page.locator('body').innerText();
    expect(texto).toContain('0 / 8');
  });
});
