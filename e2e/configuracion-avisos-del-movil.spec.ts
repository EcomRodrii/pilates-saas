import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración › Cómo me comunico › Avisos en el móvil (migr 20260921150000):
//   · la antelación del recordatorio se guarda al elegirla, en su columna;
//   · el texto de un aviso se guarda con título y cuerpo, sin variables ajenas;
//   · si la base no guarda nada (la RLS no casa: 0 filas, sin error), se dice y
//     no se da por hecho. Con contador: «no dijo que sí» podría ser «no lo intentó».
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function panel(page: Page, opciones: { plantillaGuarda?: boolean } = {}) {
  await montar(page);
  const studios: Record<string, unknown>[] = [];
  const plantillas: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/studios**', async (r) => {
    if (r.request().method() !== 'PATCH') return r.fallback();
    studios.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, [{ id: 'studio-test' }]);
  });
  await page.route('**/rest/v1/notification_template**', (r) => {
    const m = r.request().method();
    if (m === 'GET') return json(r, []);
    plantillas.push(r.request().postDataJSON() as Record<string, unknown>);
    return json(r, opciones.plantillaGuarda === false ? [] : [{ id: 'tpl' }]);
  });
  return { studios, plantillas };
}

test('la antelación del recordatorio se guarda al elegirla', async ({ page }) => {
  const { studios } = await panel(page);
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');

  const primero = page.getByLabel('Primer recordatorio');
  await expect(primero).toHaveValue('24', { timeout: 30_000 });
  await primero.selectOption('48');

  await expect.poll(() => studios.length).toBe(1);
  expect(studios[0]).toEqual({ recordatorio_largo_horas: 48 });
  await expect(page.getByText('Recordatorio guardado')).toBeVisible();
});

test('reescribir un aviso guarda título y texto, y lo marca como suyo', async ({ page }) => {
  const { plantillas } = await panel(page);
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');

  await page.getByRole('button', { name: 'Editar «Clase cancelada»' }).click({ timeout: 30_000 });
  await page.getByLabel(/^Título/).fill('Hoy no hay {clase}');
  await page.getByLabel(/^Texto/).fill('La de {cuando} no se da. Te devolvemos la sesión.');
  await expect(page.getByText('Hoy no hay Reformer')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect.poll(() => plantillas.length).toBe(1);
  expect(plantillas[0]).toMatchObject({
    studio_id: 'studio-test', event_type: 'clase.cancelada', locale: 'es',
    title_tpl: 'Hoy no hay {clase}', body_tpl: 'La de {cuando} no se da. Te devolvemos la sesión.',
  });
  await expect(page.getByText('Texto tuyo')).toBeVisible();
});

test('una variable que el aviso no trae no se deja guardar', async ({ page }) => {
  const { plantillas } = await panel(page);
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');

  await page.getByRole('button', { name: 'Editar «Clase cancelada»' }).click({ timeout: 30_000 });
  await page.getByLabel(/^Título/).fill('Hola {nombre}');
  await expect(page.getByRole('alert').filter({ hasText: '{nombre}' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
  expect(plantillas).toHaveLength(0);
});

test('si la base no lo guarda, se dice y no aparece como suyo', async ({ page }) => {
  const { plantillas } = await panel(page, { plantillaGuarda: false });
  await ir(page, 'configuracion?tab=comunicacion&abrir=avisos-del-movil');

  await page.getByRole('button', { name: 'Editar «Clase cancelada»' }).click({ timeout: 30_000 });
  await page.getByLabel(/^Título/).fill('Hoy no hay {clase}');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido guardar el texto' })).toBeVisible();
  expect(plantillas.length).toBeGreaterThan(0);
  await expect(page.getByText('Texto tuyo')).toHaveCount(0);
});
