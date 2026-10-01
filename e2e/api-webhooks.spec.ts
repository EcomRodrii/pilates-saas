import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks de la API (F2), dentro de «API para tu contabilidad».
//
// Lo que se fija:
//   · crear un webhook propone los avisos de dinero y enseña el secreto de
//     firma UNA vez;
//   · un webhook que no consigue entregar lo dice en su fila, con el motivo;
//   · si el servidor dice que no (una URL interna), se dice por qué y NO
//     aparece ningún secreto — contando que la petición SÍ salió.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const SECRETO = `whsec_${'b'.repeat(43)}`;
const TODOS = [
  'recibo.creado', 'recibo.actualizado', 'recibo.eliminado',
  'factura.creada', 'factura.actualizada', 'factura.eliminada',
  'devolucion.creada', 'devolucion.actualizada', 'devolucion.eliminada',
  'venta.creada', 'venta.actualizada', 'venta.eliminada',
  'clienta.creada', 'clienta.actualizada', 'clienta.eliminada',
];

const FALLANDO = {
  id: 'whk-1', url: 'https://conta.example.com/tentare', descripcion: 'Contabilidad', tipos: ['recibo.creado'],
  creadoEn: '2026-09-30T10:00:00Z', estado: 'fallando', desactivadoEn: null, motivoDesactivado: null,
  fallandoDesde: '2026-10-01T08:00:00Z', ultimoExitoEn: null, ultimoIntentoEn: '2026-10-01T09:00:00Z',
  ultimoEstadoHttp: 500, ultimoError: 'Respondió 500.', secretoAnteriorHasta: null,
};

async function abrir(page: Page, opts: { webhooks?: unknown[]; falloCrear?: boolean } = {}) {
  const posts: unknown[] = [];
  await montar(page);
  // Después de montar(): Playwright prueba las rutas en orden inverso al registro.
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
  await page.route(u => u.pathname === '/api/integrations/api-publica/actividad', r => json(r, { llamadas: [] }));
  await page.route(u => u.pathname === '/api/integrations/api-publica/claves', r =>
    json(r, { activada: true, permitidos: ['clientas:leer', 'clientas:datos_fiscales', 'pagos:leer', 'facturas:leer', 'planes:leer'], claves: [] }));
  await page.route(u => u.pathname === '/api/integrations/api-publica/webhooks', r => {
    if (r.request().method() === 'GET') return json(r, { activada: true, tipos: TODOS, webhooks: opts.webhooks ?? [] });
    posts.push(r.request().postDataJSON());
    if (opts.falloCrear) return json(r, { error: 'Ese dominio apunta a una dirección privada o interna: tiene que ser pública en internet.' }, 400);
    return json(r, { id: 'whk-2', secreto: SECRETO }, 201);
  });
  await ir(page, 'configuracion?tab=conexiones');
  await page.locator('#api-publica').click({ timeout: 30_000 });
  return { posts };
}

const cajon = (page: Page) => page.getByRole('dialog').first();

test('crear un webhook propone los avisos de dinero y enseña el secreto una vez', async ({ page }) => {
  const { posts } = await abrir(page);
  await cajon(page).getByRole('button', { name: /Añadir un webhook/ }).click();
  await cajon(page).getByLabel('Dirección de tu programa (https)').fill('https://conta.example.com/tentare');
  await cajon(page).getByRole('button', { name: 'Crear el webhook' }).click();

  await expect(cajon(page).getByText(/Copia el secreto de firma ahora: no lo volverás a ver/)).toBeVisible();
  await expect(cajon(page).getByLabel('Secreto de firma')).toHaveValue(SECRETO);
  expect(posts.length, 'la petición de crear tiene que salir').toBeGreaterThan(0);
  const cuerpo = posts[0] as { url: string; tipos: string[] };
  expect(cuerpo.url).toBe('https://conta.example.com/tentare');
  // Por defecto, todo lo de dinero y nada de alumnas.
  expect(cuerpo.tipos).toContain('recibo.actualizado');
  expect(cuerpo.tipos).toContain('factura.creada');
  expect(cuerpo.tipos.some((t) => t.startsWith('clienta.'))).toBe(false);

  await cajon(page).getByRole('button', { name: 'Ya lo he guardado' }).click();
  await expect(cajon(page).getByLabel('Secreto de firma')).toHaveCount(0);
});

test('un webhook que no consigue entregar lo dice, con el motivo', async ({ page }) => {
  await abrir(page, { webhooks: [FALLANDO] });
  await expect(cajon(page).getByText(/No consigue entregar desde .* Respondió 500\./)).toBeVisible();
});

test('si el servidor rechaza la dirección, se dice por qué y no aparece ningún secreto', async ({ page }) => {
  const { posts } = await abrir(page, { falloCrear: true });
  await cajon(page).getByRole('button', { name: /Añadir un webhook/ }).click();
  await cajon(page).getByLabel('Dirección de tu programa (https)').fill('https://interno.example.com/h');
  await cajon(page).getByRole('button', { name: 'Crear el webhook' }).click();

  await expect(cajon(page).getByRole('alert').filter({ hasText: 'dirección privada o interna' })).toBeVisible();
  expect(posts.length, 'la petición tiene que haber salido: si no, este test no prueba nada').toBeGreaterThan(0);
  await expect(cajon(page).getByLabel('Secreto de firma')).toHaveCount(0);
});
