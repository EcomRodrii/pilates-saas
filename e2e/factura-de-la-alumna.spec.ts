import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// «Descargar factura» en el detalle de un pago.
//
// Este botón NO estaba, y no era un olvido: la pantalla llevaba una nota
// explicando que no existía ruta que sirviera una factura a una alumna y que
// poner un botón con un toast de «pendiente» sería peor que no ponerlo. Esa
// cautela era correcta y apuntaba al CÓMO.
//
// Lo que se vigila aquí son las dos mitades de hacerlo bien:
//
//  · Con factura emitida, se descarga — y NO se enseña además el «pídesela al
//    estudio», que dejaría a la clienta sin saber cuál de las dos vale.
//  · Sin factura (35 de 73 recibos en producción no la llevan), no hay botón y
//    se mantiene el respaldo. No tener factura no es un error.
//
// La autorización de verdad —que el recibo sea SUYO— vive en el servidor y se
// deriva del JWT, no del body; aquí se comprueba que la pantalla no la suple
// enseñando algo cuando el servidor dice que no.
// ─────────────────────────────────────────────────────────────────────────────

const base = `/portal/${SLUG}`;

const FACTURA = {
  factura: {
    id: 'fac-1', studioId: STUDIO_ID, reciboId: 'rec-1', numeroCompleto: 'F2026/0001',
    fechaEmision: '2026-08-01', receptorNombre: 'Marta Ruiz', receptorNIF: null,
    baseImponible: 82.64, tipoIVA: 21, cuotaIVA: 17.36, total: 100,
    verifactuHash: null, verifactuPrevHash: null, verifactuTs: null, verifactuSeq: null,
  },
  emisor: { nombre: 'Pilates Centro SL', nif: 'B00000000', direccion: 'Calle Falsa 1, 29001, Málaga' },
  receptor: { telefono: null, email: 'marta@example.com' },
};

async function montar(page: Page, opts: { factura?: boolean } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const socia = f.socia as Record<string, unknown>;
  socia.recibos = [{
    id: 'rec-1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', concepto: 'Bono 10 clases',
    importe: 100, estado: 'COBRADO', fechaCobro: '2026-08-01', fechaVencimiento: '2026-08-01',
    metodoCobro: 'Tarjeta',
  }];
  await page.route('**/api/public/studio-data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/public/factura', (r) => (opts.factura
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FACTURA) })
    // 404 = ese recibo no tiene factura emitida. Es el caso normal.
    : r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Sin factura' }) })));
}

test.describe('Factura de la alumna', () => {
  test('con factura emitida, aparece el botón y desaparece el «pídesela al estudio»', async ({ page }) => {
    await montar(page, { factura: true });
    await page.goto(`${base}/pagos/rec-1`);

    await expect(page.getByRole('button', { name: 'Descargar factura' })).toBeVisible({ timeout: 30_000 });
    // Las dos cosas a la vez dejarían a la clienta sin saber cuál vale.
    await expect(page.getByText(/pídesela al estudio/i)).toHaveCount(0);
  });

  test('sin factura, no hay botón y se mantiene el respaldo', async ({ page }) => {
    await montar(page, { factura: false });
    await page.goto(`${base}/pagos/rec-1`);

    await expect(page.getByText(/pídesela al estudio/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Descargar factura' })).toHaveCount(0);
  });

  test('la factura se pide AL MONTAR, no al pulsar', async ({ page }) => {
    // No es un capricho: `abrirFacturaPDF` hace `window.open`, y el navegador
    // lo bloquea si sale de un callback asíncrono en vez de del clic. Si
    // alguien mueve la petición al onClick, el botón deja de abrir nada — y
    // eso no falla, simplemente no pasa nada.
    const peticiones: string[] = [];
    await montar(page, { factura: true });
    page.on('request', (r) => { if (r.url().includes('/api/public/factura')) peticiones.push(r.method()); });

    await page.goto(`${base}/pagos/rec-1`);
    await expect(page.getByRole('button', { name: 'Descargar factura' })).toBeVisible({ timeout: 30_000 });
    // Ya pedida ANTES de tocar nada.
    expect(peticiones.length).toBeGreaterThan(0);
  });
});
