import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Nuevo cobro» y la casilla «Es la renovación de su plan».
//
// Al cobrar un recibo, el servidor solo entrega el plan (recarga el bono o extiende
// la cuota) si el recibo lleva `es_renovacion = true`. Un cobro suelto enlazado al plan
// activo de la clienta es una VENTA: cobrarlo no toca su plan, salvo que quien lo crea
// lo diga. Hay dos formularios (Cobros y la ficha de la clienta) y los dos tienen que:
//   · enseñar la casilla solo si la clienta tiene un plan activo que renovar;
//   · dejarla SIN marcar por defecto;
//   · mandar `es_renovacion` tal y como se dejó, y nunca `true` sin plan.
//
// ⚠️ Cada test exige `escrituras > 0`: un «no marcó nada» sin haber creado el recibo es
// verdad por no haber intentado nada (ver `.claude/tentare-os.md`).
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type FilaRecibo = Record<string, unknown>;

/** El panel sembrado, más la captura de lo que el navegador ESCRIBE en `recibos`. */
async function montarPanel(page: Page, opts: { sinPlanes?: boolean } = {}) {
  await montar(page);
  const escrituras: FilaRecibo[] = [];
  // Playwright resuelve en orden INVERSO al de registro: esto va DESPUÉS de `montar`.
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const cuerpo = route.request().postDataJSON() as FilaRecibo | FilaRecibo[];
    escrituras.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  });
  if (opts.sinPlanes) await page.route('**/rest/v1/suscripciones**', route => json(route, []));
  return escrituras;
}

const casilla = (page: Page) => page.getByRole('dialog').getByRole('checkbox', { name: /Es la renovación de su plan/ });

async function abrirYRellenar(page: Page, placeholderConcepto: string) {
  await page.getByRole('button', { name: 'Nuevo cobro' }).first().click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await dialogo.getByPlaceholder(placeholderConcepto).fill('Cuota de octubre');
  await dialogo.getByPlaceholder('85.00').fill('89');
  return dialogo;
}

async function abrirNuevoCobroDeCobros(page: Page) {
  await ir(page, 'cobros');
  await expect(page.getByRole('button', { name: 'Nuevo cobro' }).first()).toBeVisible({ timeout: 30_000 });
  return abrirYRellenar(page, 'Mensual Ilimitado — Jul 2026');
}

async function abrirNuevoCobroDeLaFicha(page: Page) {
  await ir(page, 'clientas/soc-1');
  await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nuevo cobro' }).first()).toBeVisible({ timeout: 30_000 });
  return abrirYRellenar(page, 'Mensual Jul 2026');
}

test.describe('Cobros · Nuevo cobro', () => {
  test('la casilla sale sin marcar y, sin marcarla, el cobro es una venta (no renueva)', async ({ page }) => {
    const escrituras = await montarPanel(page);
    const dialogo = await abrirNuevoCobroDeCobros(page);

    await expect(casilla(page)).toBeVisible();
    await expect(casilla(page)).not.toBeChecked();
    await expect(dialogo).toContainText('Bono 10 clases');

    await dialogo.getByRole('button', { name: 'Crear cobro' }).click();
    await expect.poll(() => escrituras.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(escrituras[0].es_renovacion).toBe(false);
    // Sigue enlazado al plan (para verlo en su ficha), pero no lo renueva.
    expect(escrituras[0].suscripcion_id).toBe('sus-1');
  });

  test('marcada, el cobro se crea como renovación del plan', async ({ page }) => {
    const escrituras = await montarPanel(page);
    const dialogo = await abrirNuevoCobroDeCobros(page);

    await casilla(page).check();
    await dialogo.getByRole('button', { name: 'Crear cobro' }).click();
    await expect.poll(() => escrituras.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(escrituras[0].es_renovacion).toBe(true);
    expect(escrituras[0].suscripcion_id).toBe('sus-1');
  });

  test('sin plan activo no hay casilla y nunca se crea como renovación', async ({ page }) => {
    const escrituras = await montarPanel(page, { sinPlanes: true });
    const dialogo = await abrirNuevoCobroDeCobros(page);

    await expect(casilla(page)).toHaveCount(0);
    await dialogo.getByRole('button', { name: 'Crear cobro' }).click();
    await expect.poll(() => escrituras.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(escrituras[0].es_renovacion).toBe(false);
    expect(escrituras[0].suscripcion_id).toBeNull();
  });
});

test.describe('Ficha de la clienta · Nuevo cobro', () => {
  test('la casilla sale sin marcar y, sin marcarla, el cobro no renueva', async ({ page }) => {
    const escrituras = await montarPanel(page);
    const dialogo = await abrirNuevoCobroDeLaFicha(page);

    await expect(casilla(page)).toBeVisible();
    await expect(casilla(page)).not.toBeChecked();
    await dialogo.getByRole('button', { name: 'Crear cobro' }).click();
    await expect.poll(() => escrituras.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(escrituras[0].es_renovacion).toBe(false);
  });

  test('marcada, el cobro se crea como renovación del plan', async ({ page }) => {
    const escrituras = await montarPanel(page);
    const dialogo = await abrirNuevoCobroDeLaFicha(page);

    await casilla(page).check();
    await dialogo.getByRole('button', { name: 'Crear cobro' }).click();
    await expect.poll(() => escrituras.length, { message: 'no llegó a crearse el recibo' }).toBeGreaterThan(0);
    expect(escrituras[0].es_renovacion).toBe(true);
    expect(escrituras[0].suscripcion_id).toBe('sus-1');
  });
});
