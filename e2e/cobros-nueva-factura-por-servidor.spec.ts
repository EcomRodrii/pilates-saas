import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Nueva factura» (Cobros): el recibo nace PENDIENTE y lo cobra el SERVIDOR.
//
// Antes `crearFacturaDirecta` insertaba el recibo ya COBRADO desde el navegador y sellaba la
// factura por su cuenta. La base de datos ya no deja crear un recibo cobrado desde el navegador
// (PR4 de «recibo cobrado»): se crea pendiente y se cobra por `POST /api/cobros/marcar-cobrado`,
// que es quien sella la factura. Cuatro desenlaces, y la pantalla tiene que distinguirlos:
//   · cobrado y facturado → «Factura generada.»;
//   · el servidor no confirma el cobro → el recibo EXISTE pendiente: se dice dónde está y no se
//     deja reenviar el formulario (crearía otro);
//   · lo demás (nada se creó) lo cubre `citas-guardadas.spec.ts`.
//
// ⚠️ Cada «no debe pasar» lleva su contador de «sí se intentó» (ver `.claude/tentare-os.md`).
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type FilaRecibo = Record<string, unknown>;
interface Cobro { reciboIds: string[]; metodo: string | null }

// El estudio del sembrado, pero que emite facturas desde Tentare (si no, «Nueva factura» no sale).
const STUDIO_VERIFACTU = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
  modo_facturacion: 'verifactu',
};

async function montarPanel(page: Page, opts: { cobro?: 'aplicada' | 'sin_sellar' | 'no_cobrable' | 'sin_detalle' } = {}) {
  await montar(page);
  const recibos: FilaRecibo[] = [];
  const cobros: Cobro[] = [];

  // Playwright resuelve en orden INVERSO al de registro: esto va DESPUÉS de `montar`.
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_VERIFACTU));
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const cuerpo = req.postDataJSON() as FilaRecibo | FilaRecibo[];
    recibos.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = route.request().postDataJSON() as Cobro;
    cobros.push(cuerpo);
    switch (opts.cobro ?? 'aplicada') {
      case 'sin_detalle': return json(route, {});
      case 'no_cobrable':
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'no_cobrable', selladoOk: true, error: 'Este recibo ya no se puede cobrar.' })) }, 409);
      case 'sin_sellar':
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: false })) });
      default:
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })) });
    }
  });
  return { recibos, cobros };
}

async function generarFactura(page: Page, opts: { dobleClic?: boolean } = {}) {
  await ir(page, 'cobros');
  await page.getByRole('button', { name: 'Nueva factura' }).click({ timeout: 30_000 });
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByPlaceholder('Cuota mensual Pilates — Jun 2026').fill('Taller de verano');
  await dialogo.getByPlaceholder('85.00').fill('100');
  const generar = dialogo.getByRole('button', { name: 'Generar factura' });
  if (opts.dobleClic) await generar.dblclick();
  else await generar.click();
  return dialogo;
}

test.describe('Cobros · Nueva factura', () => {
  test('crea el recibo PENDIENTE y lo cobra el servidor con su id', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page);
    await generarFactura(page);

    await expect(page.getByText('Factura generada.')).toBeVisible({ timeout: 15_000 });
    expect(cobros.length, 'el cobro no llegó a pedirse').toBe(1);
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({ estado: 'PENDIENTE', importe: 121, concepto: 'Taller de verano' });
    expect(cobros[0]).toEqual({ reciboIds: [recibos[0].id], metodo: null });
  });

  test('cobrado pero con la factura sin sellar: dice que el cobro SÍ está registrado y qué revisar', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page, { cobro: 'sin_sellar' });
    await generarFactura(page);

    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBe(1);
    await expect(page.getByText(/Cobro registrado\. La factura ha quedado pendiente de sellar/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Factura generada.')).toHaveCount(0);
    expect(recibos).toHaveLength(1);
  });

  test('un doble clic en «Generar factura» crea UN recibo y pide UN cobro', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page);
    await generarFactura(page, { dobleClic: true });

    await expect(page.getByText('Factura generada.')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expect(recibos, 'el doble clic creó dos recibos').toHaveLength(1);
    expect(cobros, 'el doble clic pidió el cobro dos veces').toHaveLength(1);
  });

  for (const [nombre, cobro] of [
    ['el servidor dice que no se puede cobrar', 'no_cobrable'],
    ['un 200 sin detalle', 'sin_detalle'],
  ] as const) {
    test(`⚠️ ${nombre}: no dice «Factura generada», dice dónde está el recibo y no deja reenviar`, async ({ page }) => {
      const { recibos, cobros } = await montarPanel(page, { cobro });
      await generarFactura(page);

      await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBeGreaterThan(0);
      await expect(page.getByText(/La factura no se ha generado\./)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Quién me debe/).first()).toBeVisible();
      await expect(page.getByText('Factura generada.')).toHaveCount(0);
      // El recibo existe pendiente: el formulario se cierra para no crear otro con un segundo clic.
      expect(recibos.map(r => r.estado)).toEqual(['PENDIENTE']);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(cobros, 'una sola petición de cobro por un clic').toHaveLength(1);
    });
  }
});
