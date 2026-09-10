import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Los recibos de la alumna: la lista y el detalle.
//
// ⚠️ El método de cobro se pintaba con el ENUM CRUDO de `recibos.metodo_cobro`:
// debajo de la fecha de su recibo leía «TARJETA», «EFECTIVO», «TRANSFERENCIA»,
// «BIZUM» y «SEPA», a gritos en mayúsculas. Los cinco están en producción.
//
// «SEPA» es además jerga —el nombre del esquema europeo de adeudos, no algo que
// nadie reconozca en su extracto—, y el panel ya lo llama «Domiciliación
// bancaria»: el estudio y la alumna tienen que nombrar lo mismo igual.

const base = `/portal/${SLUG}`;

/** Un recibo por cada método que existe de verdad en producción. */
const RECIBOS = [
  { id: 'r-tar', concepto: 'Bono 8 sesiones', importe: 96, estado: 'COBRADO', fechaCobro: '2026-08-01', metodoCobro: 'TARJETA' },
  { id: 'r-sepa', concepto: 'Mensual ilimitado', importe: 89, estado: 'PENDIENTE', fechaVencimiento: '2026-09-01', metodoCobro: 'SEPA' },
  { id: 'r-efe', concepto: 'Clase suelta', importe: 18, estado: 'COBRADO', fechaCobro: '2026-07-20', metodoCobro: 'EFECTIVO' },
  { id: 'r-biz', concepto: 'Bono 4 sesiones', importe: 52, estado: 'COBRADO', fechaCobro: '2026-07-10', metodoCobro: 'BIZUM' },
  { id: 'r-tra', concepto: 'Taller de suelo pélvico', importe: 35, estado: 'COBRADO', fechaCobro: '2026-07-01', metodoCobro: 'TRANSFERENCIA' },
  // NULL en 38 recibos de producción: un cobro en mano que nadie marcó.
  { id: 'r-nulo', concepto: 'Matrícula', importe: 20, estado: 'COBRADO', fechaCobro: '2026-06-01', metodoCobro: null },
];

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.socia as Record<string, unknown>).recibos = RECIBOS.map((r) => ({ ...r, socioId: SOCIO_ID }));
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

test.describe('Student PWA · pagos', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('la lista no le grita el enum de la base de datos', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/pagos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Bono 8 sesiones')).toBeVisible({ timeout: 30_000 });
    const texto = await page.locator('main, body').first().innerText();
    expect(texto).not.toContain('Esta página no existe');

    for (const crudo of ['TARJETA', 'EFECTIVO', 'TRANSFERENCIA', 'BIZUM', 'SEPA']) {
      expect(texto, `«${crudo}» es el enum de la BD, no algo que se le enseñe a nadie`).not.toContain(crudo);
    }
    for (const bueno of ['Tarjeta', 'Efectivo', 'Transferencia', 'Bizum', 'Domiciliación bancaria']) {
      expect(texto, `falta «${bueno}»`).toContain(bueno);
    }
  });

  test('sin método no queda el separador colgando', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/pagos`, { waitUntil: 'domcontentloaded' });
    const fila = page.getByText('Matrícula').locator('xpath=ancestor::a[1]');
    await expect(fila).toBeVisible({ timeout: 30_000 });
    expect(await fila.innerText(), 'el punto de «unir» se queda solo al final').not.toMatch(/·\s*$/m);
  });

  test('y el detalle tampoco, que es donde se mira de cerca', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/pagos/r-sepa`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Mensual ilimitado')).toBeVisible({ timeout: 30_000 });
    const texto = await page.locator('body').innerText();
    expect(texto).toContain('Domiciliación bancaria');
    expect(texto, 'jerga del esquema europeo de adeudos en la pantalla de una alumna').not.toContain('SEPA');
  });
});
