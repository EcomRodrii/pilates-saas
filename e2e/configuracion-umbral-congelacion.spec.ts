import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Dos reglas del estudio que se eligen en Configuración y cumple la base de datos:
//   · «Se cobra a partir de la falta N» (Cómo reservan → Si cancela tarde o no viene; migr 20261110130000): perdonar las
//     primeras faltas. Solo puede cobrar MENOS: el contrato de la alumna no cambia.
//   · «Congelar una cuota o un bono» (Cobros y facturas; migr 20261110140000): si se puede congelar y cuántos días como
//     máximo alarga el plan.
//
// ⚠️ Cada «el servidor dice no» comprueba que se INTENTÓ escribir: sin contador, «no mintió» puede ser verdad por no haber
// hecho nada.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', nif: 'B12345674', iva_por_defecto: 21, stripe_account_id: 'acct_e2e',
  cancelacion_ventana_horas: 12, permite_lista_espera: true, lista_espera_plazo_aceptacion_minutos: 0,
  penalizacion_importe_eur: 5, penalizacion_aplica_cancelacion_tardia: true, penalizacion_aplica_no_show: true,
  penalizacion_cobro_automatico: false, penalizacion_umbral_faltas: 1, penalizacion_umbral_ventana_dias: 90,
  congelacion_permitida: true, congelacion_max_dias: null,
};

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: { fila?: Record<string, unknown>; fallo?: boolean } = {}) {
  const patches: Record<string, unknown>[] = [];
  await montar(page);
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, { ...FILA, ...opts.fila });
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await ir(page, ruta);
  return { patches };
}

const valor = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const cajon = (page: Page) => page.getByRole('dialog').first();
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });

test.describe('Cobrar a partir de la falta N', () => {
  test('por defecto cobra desde la primera, y elegir otra pide los días y se guarda en sus dos columnas', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=reservas');
    await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toHaveText('5 € · lo apruebas tú', { timeout: 30_000 });
    await page.locator('#si-cancela-tarde-o-no-viene').click();
    const desde = cajon(page).getByLabel('Cobrar desde');
    await expect(desde).toHaveValue('1');
    await expect(cajon(page).getByLabel('Contar las faltas de los últimos')).toHaveCount(0);

    await desde.selectOption('3');
    await cajon(page).getByLabel('Contar las faltas de los últimos').selectOption('180');
    await expect(cajon(page).getByText(/Se cobra a partir de su falta n\.º 3 en los últimos 180 días: las anteriores se perdonan\./)).toBeVisible();
    await guardar(page).click();
    // El cargo es dinero: «Guardar» pregunta antes, con lo que va a pasar (la frase ya dice desde qué falta).
    const pregunta = page.getByRole('dialog', { name: '¿Cambiar el cargo?' });
    await expect(pregunta.getByText(/Se cobra a partir de su falta n\.º 3 en los últimos 180 días/)).toBeVisible();
    expect(patches, 'preguntar no escribe').toHaveLength(0);
    await page.getByRole('button', { name: 'Sí, guardarlo' }).click();
    await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ penalizacion_umbral_faltas: 3, penalizacion_umbral_ventana_dias: 180 });
  });

  test('la fila dice desde qué falta se cobra', async ({ page }) => {
    await abrir(page, 'configuracion?tab=reservas', { fila: { penalizacion_umbral_faltas: 2 } });
    await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toHaveText('5 € · desde la falta 2 · lo apruebas tú', { timeout: 30_000 });
  });

  test('si el servidor dice que no, se dice y los cambios siguen ahí', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=reservas', { fallo: true });
    await expect(valor(page, 'si-cancela-tarde-o-no-viene')).toBeVisible({ timeout: 30_000 });
    await page.locator('#si-cancela-tarde-o-no-viene').click();
    await cajon(page).getByLabel('Cobrar desde').selectOption('2');
    await guardar(page).click();
    await page.getByRole('button', { name: 'Sí, guardarlo' }).click();
    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/);
    expect(patches.length, 'se intentó guardar').toBeGreaterThan(0);
    await expect(cajon(page).getByLabel('Cobrar desde')).toHaveValue('2');
  });
});

test.describe('Congelar una cuota o un bono', () => {
  test('de serie se puede congelar sin tope; poner un máximo se guarda con sus días', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=cobros');
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('se puede, sin tope', { timeout: 30_000 });
    await page.locator('#congelar-una-cuota').click();
    await expect(cajon(page).getByText('Cada día congelado alarga su cuota o bono, sin límite: como hasta ahora.')).toBeVisible();

    await cajon(page).getByRole('switch', { name: 'Poner un máximo de días de congelación' }).click();
    await cajon(page).getByLabel('Máximo de días por congelación').fill('20');
    await expect(cajon(page).getByText('Si una alumna está congelada 40 días, su cuota o bono se alarga como máximo 20.')).toBeVisible();
    await guardar(page).click();
    await expect(page.getByText('Guardada la política de congelación')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ congelacion_permitida: true, congelacion_max_dias: 20 }]);
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('alarga hasta 20 días');
  });

  test('apagarla se guarda sin tope y la fila lo dice', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=cobros', { fila: { congelacion_max_dias: 15 } });
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('alarga hasta 15 días', { timeout: 30_000 });
    await page.locator('#congelar-una-cuota').click();
    await cajon(page).getByRole('switch', { name: 'Se pueden congelar cuotas y bonos' }).click();
    await expect(cajon(page).getByText('Nadie del equipo podrá congelar una cuota o un bono mientras esté apagado.')).toBeVisible();
    await guardar(page).click();
    await expect(page.getByText('Guardada la política de congelación')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ congelacion_permitida: false, congelacion_max_dias: null }]);
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('no se puede congelar');
  });

  test('si el servidor dice que no, la fila sigue como estaba', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=cobros', { fallo: true });
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('se puede, sin tope', { timeout: 30_000 });
    await page.locator('#congelar-una-cuota').click();
    await cajon(page).getByRole('switch', { name: 'Se pueden congelar cuotas y bonos' }).click();
    await guardar(page).click();
    await expect(cajon(page).getByRole('alert')).toBeVisible();
    expect(patches.length, 'se intentó guardar').toBeGreaterThan(0);
    await expect(valor(page, 'congelar-una-cuota')).toHaveText('se puede, sin tope');
  });
});
