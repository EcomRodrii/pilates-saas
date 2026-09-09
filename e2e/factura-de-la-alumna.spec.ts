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

// Lo que el servidor manda a la alumna: el DOCUMENTO, sin la cadena Veri*Factu
// del estudio. `sello` viene ya resuelto —y hoy, en producción, es `null` en
// todas: ninguna factura ha sido admitida todavía por la AEAT.
const FACTURA = {
  factura: {
    numeroCompleto: 'F2026/0001',
    fechaEmision: '2026-08-01', receptorNombre: 'Marta Ruiz', receptorNIF: null,
    baseImponible: 82.64, tipoIVA: 21, cuotaIVA: 17.36, total: 100,
  },
  emisor: { nombre: 'Pilates Centro SL', nif: 'B00000000', direccion: 'Calle Falsa 1, 29001, Málaga' },
  receptor: { telefono: null, email: 'marta@example.com' },
  sello: null,
};

// `abrirFacturaPDF` hace `window.open` + `document.write`. Playwright no puede
// leer ese documento (se escribe a mano en una ventana en blanco), así que se
// sustituye `window.open` por un doble que guarda lo escrito. Es la única forma
// de mirar el PAPEL que recibe la alumna y no solo el botón que lo abre.
async function espiarVentanaDeFactura(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __facturaHTML?: string }).__facturaHTML = undefined;
    window.open = () =>
      ({
        document: {
          write: (html: string) => {
            (window as unknown as { __facturaHTML?: string }).__facturaHTML = html;
          },
          close: () => {},
        },
      }) as unknown as Window;
  });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// El papel que se lleva la alumna.
//
// Hasta #1794 esta factura salía con la huella SHA-256 de la cadena Veri*Factu,
// la URL de cotejo impresa como texto y —porque esta pantalla era la única que
// no pasaba el flag de entorno— el aviso «Entorno de PRUEBAS, pendiente de
// validación con la AEAT y asesor fiscal». Todo eso es del registro fiscal del
// estudio; ninguna de las tres cosas es de la clienta.
// ─────────────────────────────────────────────────────────────────────────────

async function htmlDeLaFactura(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Descargar factura' }).click();
  const html = await page.evaluate(() => (window as unknown as { __facturaHTML?: string }).__facturaHTML);
  expect(html, 'no se llegó a generar ninguna factura').toBeTruthy();
  return html as string;
}

test.describe('La factura de la alumna no lleva el registro fiscal del estudio', () => {
  test('sin sello: ni QR, ni huella, ni aviso de entorno de pruebas', async ({ page }) => {
    await espiarVentanaDeFactura(page);
    await montar(page, { factura: true });
    await page.goto(`${base}/pagos/rec-1`);
    await expect(page.getByRole('button', { name: 'Descargar factura' })).toBeVisible({ timeout: 30_000 });

    const html = await htmlDeLaFactura(page);
    expect(html).not.toMatch(/veri\*?factu/i);
    expect(html).not.toContain('Huella');
    expect(html).not.toContain('<svg');
    expect(html).not.toMatch(/prewww2\.aeat\.es/);
    expect(html).not.toMatch(/PRUEBAS/i);
  });

  test('y sí lleva lo suyo: estudio, alumna, concepto, IVA y total', async ({ page }) => {
    await espiarVentanaDeFactura(page);
    await montar(page, { factura: true });
    await page.goto(`${base}/pagos/rec-1`);
    await expect(page.getByRole('button', { name: 'Descargar factura' })).toBeVisible({ timeout: 30_000 });

    const html = await htmlDeLaFactura(page);
    expect(html).toContain('Pilates Centro SL');
    expect(html).toContain('B00000000');
    expect(html).toContain('Marta Ruiz');
    expect(html).toContain('F2026/0001');
    expect(html).toContain('IVA (21%)');
    expect(html).toContain('100,00 €');
  });
});
