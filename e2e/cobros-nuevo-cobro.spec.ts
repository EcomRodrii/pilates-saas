import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Nuevo cobro» (rediseño de Cobros, 2-oct-2026): UN diálogo para Cobros y para
// la ficha de la clienta. Sustituye a «Nuevo cobro» (solo pendiente) y a «Nueva
// factura» (cobrado al contado) del panel anterior.
//
//  · «Lo paga después» → un recibo PENDIENTE con su vencimiento, nada más.
//  · «Sí, ahora» → el recibo nace PENDIENTE y lo cobra el SERVIDOR
//    (`POST /api/cobros/marcar-cobrado`) con el método elegido, que es obligatorio.
//    Si el servidor no confirma, el recibo existe: se cierra el diálogo (un segundo
//    clic crearía otro) y se dice dónde está.
//  · «Es la renovación de su plan»: solo si hay plan activo, sin marcar por defecto.
//  · «Hacerle factura» en efectivo: la pide al servidor (`conFactura`), no la sella
//    el navegador.
//
// ⚠️ Cada «no debe pasar» lleva su contador de «sí se intentó» (ver `.claude/tentare-os.md`).
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type FilaRecibo = Record<string, unknown>;
interface Cobro { reciboIds: string[]; metodo: string | null; conFactura?: boolean }

// El estudio del sembrado, pero que emite facturas desde Tentare.
const STUDIO_VERIFACTU = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B67891234', direccion: 'Calle Mayor 4', ciudad: 'Almería',
  modo_facturacion: 'verifactu',
};

async function montarPanel(page: Page, opts: {
  sinPlanes?: boolean; factura?: boolean;
  cobro?: 'aplicada' | 'no_cobrable' | 'sin_detalle';
} = {}) {
  await montar(page);
  const recibos: FilaRecibo[] = [];
  const cobros: Cobro[] = [];
  // Playwright resuelve en orden INVERSO al de registro: esto va DESPUÉS de `montar`.
  if (opts.factura) await page.route('**/rest/v1/studios**', route => json(route, STUDIO_VERIFACTU));
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const cuerpo = route.request().postDataJSON() as FilaRecibo | FilaRecibo[];
    recibos.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  if (opts.sinPlanes) await page.route('**/rest/v1/suscripciones**', route => json(route, []));
  await page.route('**/api/pos/caja', route => json(route, { caja: { id: 'caja-1' }, esperado: 0, movimientos: [] }));
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = route.request().postDataJSON() as Cobro;
    cobros.push(cuerpo);
    switch (opts.cobro ?? 'aplicada') {
      case 'sin_detalle': return json(route, {});
      case 'no_cobrable':
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'no_cobrable', selladoOk: true, error: 'Este recibo ya no se puede cobrar.' })) }, 409);
      default:
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })) });
    }
  });
  return { recibos, cobros };
}

const dialogo = (page: Page) => page.getByTestId('dialogo-nuevo-cobro');
const casilla = (page: Page) => dialogo(page).getByRole('checkbox', { name: /Es la renovación de su plan/ });

async function rellenar(page: Page) {
  await dialogo(page).getByLabel('Concepto').fill('Cuota de octubre');
  await dialogo(page).getByLabel('Importe').fill('89');
}

async function abrirDesdeCobros(page: Page) {
  await ir(page, 'cobros');
  await page.getByRole('button', { name: 'Nuevo cobro' }).first().click({ timeout: 30_000 });
  await expect(dialogo(page)).toBeVisible();
  await dialogo(page).getByLabel('Clienta').click();
  await dialogo(page).getByLabel('Clienta').fill('María');
  await dialogo(page).getByRole('button', { name: /María García Fernández/ }).click();
  await rellenar(page);
}

async function abrirDesdeLaFicha(page: Page) {
  await ir(page, 'clientas/soc-1');
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo cobro' }).first().click({ timeout: 30_000 });
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page)).toContainText('María García Fernández');
  await rellenar(page);
}

test.describe('Cobros · Nuevo cobro · lo paga después', () => {
  test('la casilla sale sin marcar y, sin marcarla, el cobro es una venta (no renueva)', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page);
    await abrirDesdeCobros(page);

    await expect(casilla(page)).toBeVisible();
    await expect(casilla(page)).not.toBeChecked();
    await dialogo(page).getByRole('button', { name: 'Lo paga después' }).click();
    await dialogo(page).getByRole('button', { name: 'Crear el cobro' }).click();

    await expect.poll(() => recibos.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    // Una venta no va enlazada a la cuota: si quedara impagada, el reintento le cancelaría el plan.
    expect(recibos[0]).toMatchObject({ estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null, importe: 89 });
    expect(cobros, 'lo que se paga después no se cobra').toHaveLength(0);
    await expect(page.getByText(/queda en «Quién me debe»/)).toBeVisible();
  });

  test('marcada, el cobro se crea como renovación del plan', async ({ page }) => {
    const { recibos } = await montarPanel(page);
    await abrirDesdeCobros(page);

    await casilla(page).check();
    await dialogo(page).getByRole('button', { name: 'Lo paga después' }).click();
    await dialogo(page).getByRole('button', { name: 'Crear el cobro' }).click();
    await expect.poll(() => recibos.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(recibos[0]).toMatchObject({ es_renovacion: true, suscripcion_id: 'sus-1' });
  });

  test('sin plan activo no hay casilla y nunca se crea como renovación', async ({ page }) => {
    const { recibos } = await montarPanel(page, { sinPlanes: true });
    await abrirDesdeCobros(page);

    await expect(casilla(page)).toHaveCount(0);
    await dialogo(page).getByRole('button', { name: 'Lo paga después' }).click();
    await dialogo(page).getByRole('button', { name: 'Crear el cobro' }).click();
    await expect.poll(() => recibos.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(recibos[0]).toMatchObject({ es_renovacion: false, suscripcion_id: null });
  });
});

test.describe('Cobros · Nuevo cobro · ya te lo ha pagado', () => {
  test('sin método no deja cobrar; con él, el recibo nace pendiente y lo cobra el servidor', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page);
    await abrirDesdeCobros(page);

    const cobrar = dialogo(page).getByRole('button', { name: /^Cobrar/ });
    await expect(cobrar).toBeDisabled();
    await dialogo(page).getByRole('button', { name: 'Bizum' }).click();
    await expect(dialogo(page).getByLabel('Qué va a pasar')).toContainText('Se apunta en la caja.');
    await cobrar.click();

    await expect(page.getByText(/Cobrado: 89,00 € de María/)).toBeVisible({ timeout: 15_000 });
    expect(recibos).toHaveLength(1);
    expect(recibos[0]).toMatchObject({ estado: 'PENDIENTE', importe: 89 });
    expect(cobros).toEqual([{ reciboIds: [recibos[0].id], metodo: 'BIZUM' }]);
  });

  test('un doble clic crea UN recibo y pide UN cobro', async ({ page }) => {
    const { recibos, cobros } = await montarPanel(page);
    await abrirDesdeCobros(page);
    await dialogo(page).getByRole('button', { name: 'Efectivo' }).click();
    await dialogo(page).getByRole('button', { name: /^Cobrar/ }).dblclick();

    await expect(page.getByText(/Cobrado: 89,00 €/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expect(recibos, 'el doble clic creó dos recibos').toHaveLength(1);
    expect(cobros, 'el doble clic pidió el cobro dos veces').toHaveLength(1);
  });

  for (const [nombre, cobro] of [
    ['el servidor dice que no se puede cobrar', 'no_cobrable'],
    ['un 200 sin detalle', 'sin_detalle'],
  ] as const) {
    test(`⚠️ ${nombre}: no dice «Cobrado», dice dónde está el recibo y cierra el diálogo`, async ({ page }) => {
      const { recibos, cobros } = await montarPanel(page, { cobro });
      await abrirDesdeCobros(page);
      await dialogo(page).getByRole('button', { name: 'Tarjeta' }).click();
      await dialogo(page).getByRole('button', { name: /^Cobrar/ }).click();

      await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBeGreaterThan(0);
      await expect(page.getByText(/El recibo está en «Quién me debe»/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/^Cobrado:/)).toHaveCount(0);
      expect(recibos.map(r => r.estado)).toEqual(['PENDIENTE']);
      // El recibo existe: el diálogo se cierra para no crear otro con un segundo clic.
      await expect(dialogo(page)).toHaveCount(0);
      expect(cobros, 'una sola petición de cobro por un clic').toHaveLength(1);
    });
  }

  test('en efectivo, «Hacerle factura» se la pide al servidor; sin marcar, no', async ({ page }) => {
    const { cobros } = await montarPanel(page, { factura: true });
    await abrirDesdeCobros(page);
    await dialogo(page).getByRole('button', { name: 'Efectivo' }).click();

    const hacer = dialogo(page).getByRole('checkbox', { name: /Hacerle factura/ });
    await expect(hacer).toBeVisible();
    await expect(dialogo(page).getByLabel('Qué va a pasar')).toContainText('En efectivo no sale factura sola');
    // Con tarjeta no se ofrece: sale sola.
    await dialogo(page).getByRole('button', { name: 'Tarjeta' }).click();
    await expect(hacer).toHaveCount(0);
    await expect(dialogo(page).getByLabel('Qué va a pasar')).toContainText('Sale su factura.');

    await dialogo(page).getByRole('button', { name: 'Efectivo' }).click();
    await hacer.check();
    await dialogo(page).getByRole('button', { name: /^Cobrar/ }).click();
    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBe(1);
    expect(cobros[0]).toMatchObject({ metodo: 'EFECTIVO', conFactura: true });
  });
});

test.describe('Ficha de la clienta · Nuevo cobro', () => {
  test('el mismo diálogo, con ella ya elegida: sin marcar no renueva', async ({ page }) => {
    const { recibos } = await montarPanel(page);
    await abrirDesdeLaFicha(page);

    await expect(dialogo(page).getByLabel('Clienta')).toHaveCount(0);
    await expect(casilla(page)).not.toBeChecked();
    await dialogo(page).getByRole('button', { name: 'Lo paga después' }).click();
    await dialogo(page).getByRole('button', { name: 'Crear el cobro' }).click();
    await expect.poll(() => recibos.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(recibos[0]).toMatchObject({ socio_id: 'soc-1', es_renovacion: false, suscripcion_id: null });
  });

  test('marcada, el cobro se crea como renovación del plan', async ({ page }) => {
    const { recibos } = await montarPanel(page);
    await abrirDesdeLaFicha(page);

    await casilla(page).check();
    await dialogo(page).getByRole('button', { name: 'Lo paga después' }).click();
    await dialogo(page).getByRole('button', { name: 'Crear el cobro' }).click();
    await expect.poll(() => recibos.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(recibos[0]).toMatchObject({ es_renovacion: true, suscripcion_id: 'sus-1' });
  });
});
