import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La plantilla de política de cancelación a cambio del email
// (components/recursos/DescargaRecurso.tsx, lib/recursos/descargas.ts).
//
// La API se mockea (page.route): lo que se prueba es que el formulario manda
// lo que tiene que mandar y que NUNCA dice «te la hemos enviado» si el servidor
// dijo que no. Cada caso de fallo cuenta las peticiones: un «no mintió» sin
// petición podría ser verdad solo porque no llegó a intentarlo.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(120_000);

const RUTA = '/recursos/politica-de-cancelacion-de-clases';
const API = '**/api/public/descargas';

async function abrir(page: Page, responder: (route: Route) => Promise<void>) {
  const peticiones: Record<string, unknown>[] = [];
  await page.route(API, async (route) => {
    if (route.request().method() === 'POST') peticiones.push(JSON.parse(route.request().postData() || '{}'));
    await responder(route);
  });
  await page.goto(RUTA);
  const recuadro = page.getByRole('region', { name: 'Descárgala en Word, lista para rellenar' });
  await expect(recuadro).toBeVisible();
  return { recuadro, peticiones };
}

test('manda email, estudio y la casilla, y confirma solo cuando el servidor dice que sí', async ({ page }) => {
  const { recuadro, peticiones } = await abrir(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const casilla = recuadro.getByRole('checkbox', { name: /Quiero recibir por email novedades/ });
  await expect(casilla).not.toBeChecked();

  await recuadro.getByLabel('Tu email').fill('ana@example.com');
  await recuadro.getByLabel(/Nombre de tu estudio/).fill('Estudio Ejemplo');
  await casilla.check();
  await recuadro.getByRole('button', { name: 'Enviármela' }).click();

  await expect(recuadro.getByRole('status')).toContainText('Te la hemos enviado a ana@example.com');
  await expect(recuadro.getByRole('status')).toContainText('confírmalas con el botón del correo');
  expect(peticiones).toHaveLength(1);
  expect(peticiones[0]).toMatchObject({
    recurso: 'plantilla-politica-cancelacion',
    email: 'ana@example.com',
    estudio: 'Estudio Ejemplo',
    novedades: true,
    web: '',
  });
});

test('sin marcar la casilla no se piden novedades', async ({ page }) => {
  const { recuadro, peticiones } = await abrir(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await recuadro.getByLabel('Tu email').fill('ana@example.com');
  await recuadro.getByRole('button', { name: 'Enviármela' }).click();
  await expect(recuadro.getByRole('status')).toContainText('Te la hemos enviado');
  await expect(recuadro.getByRole('status')).not.toContainText('novedades');
  expect(peticiones[0]).toMatchObject({ novedades: false });
});

for (const caso of [
  { nombre: '400 con mensaje', responder: (r: Route) => r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Escribe un email válido."}' }), espera: 'Escribe un email válido.' },
  { nombre: '503 del servidor', responder: (r: Route) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"No hemos podido enviártela ahora mismo. Vuelve a intentarlo en un rato."}' }), espera: 'No hemos podido enviártela ahora mismo' },
  { nombre: '500 sin cuerpo', responder: (r: Route) => r.fulfill({ status: 500, body: '' }), espera: 'No hemos podido enviártela. Vuelve a intentarlo en un rato.' },
  { nombre: 'red caída', responder: (r: Route) => r.abort('failed'), espera: 'Revisa tu conexión' },
]) {
  test(`si el servidor dice que no (${caso.nombre}), no dice que la ha enviado`, async ({ page }) => {
    const { recuadro, peticiones } = await abrir(page, caso.responder);
    await recuadro.getByLabel('Tu email').fill('ana@example.com');
    await recuadro.getByRole('button', { name: 'Enviármela' }).click();
    await expect(recuadro.getByRole('alert')).toContainText(caso.espera);
    await expect(recuadro.getByRole('status')).toHaveCount(0);
    expect(peticiones.length).toBeGreaterThan(0);
    // Y se puede volver a intentar: el botón no se queda en «Enviando…».
    await expect(recuadro.getByRole('button', { name: 'Enviármela' })).toBeEnabled();
  });
}

test('un email mal escrito ni siquiera sale del navegador', async ({ page }) => {
  const { recuadro, peticiones } = await abrir(page, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await recuadro.getByLabel('Tu email').fill('ana@');
  await recuadro.getByRole('button', { name: 'Enviármela' }).click();
  await expect(recuadro.getByRole('alert')).toContainText('Escribe un email válido.');
  expect(peticiones).toHaveLength(0);
});
