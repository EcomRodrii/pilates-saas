import { test, expect, type Page } from '@playwright/test';
import { tokenDeSesion } from './enlace-de-correo';

// La app de tienda de UN estudio (nombre, icono y color propios, publicada desde la
// cuenta de Tentare) usa la misma entrada `/app`, fijada en su estudio. Lo decide el
// bundle id que da la carcasa y la fila activa de `apps_estudio`; sin fila activa es la
// app «Tentare» de siempre.
//
// ⚠️ La carcasa nativa se falsea con un `window.Capacitor` mínimo (como en
// reservar-portada-cabecera.spec.ts). Cada «no» lleva su contador: el endpoint que
// no se llama, o la ruta a la que no se va, pasan en verde por no haber intentado nada.

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
const USUARIO = { id: 'auth-lucia', email: 'lucia@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

const APP_LUZ = {
  slug: 'luz-pilates', nombre: 'Luz Pilates', nombreApp: 'Luz', bundleId: 'app.tentare.luz',
  icono: '/icono-estudio?inicial=L&color=%237A8B6F&size=192', color: '#7A8B6F',
};

/** La app nativa con ese bundle id: `App.getInfo` lo devuelve, el resto del puente contesta vacío. */
async function comoApp(page: Page, bundleId: string) {
  await page.addInitScript((id) => {
    const w = window as unknown as Record<string, unknown>;
    w.CapacitorCustomPlatform = { name: 'ios' };
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      PluginHeaders: [{ name: 'App', methods: [{ name: 'getInfo', rtype: 'promise' }] }],
      nativeCallback: () => Promise.resolve('e2e'),
      nativePromise: (plugin: string, metodo: string) =>
        Promise.resolve(plugin === 'App' && metodo === 'getInfo' ? { id, name: 'App', version: '1.0', build: '1' } : {}),
    };
  }, bundleId);
}

async function conSesion(page: Page) {
  await page.route('**/auth/v1/user*', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : r.fulfill(json(USUARIO)));
  await page.addInitScript(([token, usuario]) => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: token, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_at: 4102444800, expires_in: 999999999, user: usuario,
    }));
  }, [tokenDeSesion('auth-lucia'), USUARIO] as const);
}

/** `/api/public/app/app-estudio` con la respuesta que se pida, guardando el bundle que preguntó. */
async function appDeEstudio(page: Page, responder: () => { status: number; body: unknown }) {
  const n = { pedidas: 0, bundles: [] as (string | null)[] };
  await page.route('**/api/public/app/app-estudio*', (r) => {
    n.pedidas++;
    n.bundles.push(new URL(r.request().url()).searchParams.get('bundle'));
    const x = responder();
    return r.fulfill(json(x.body, x.status));
  });
  return n;
}

test('la app de un estudio abre SU entrada: su nombre, sin buscador ni logo de Tentare', async ({ page }) => {
  await comoApp(page, 'app.tentare.luz');
  const n = await appDeEstudio(page, () => ({ status: 200, body: APP_LUZ }));

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Reserva en Luz Pilates' })).toBeVisible({ timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
  expect(n.bundles[0]).toBe('app.tentare.luz');
  // No hay otro estudio que buscar, y el logo de Tentare no se pinta.
  await expect(page.getByRole('button', { name: 'Buscar mi estudio' })).toHaveCount(0);
  await expect(page.getByText('¿Tu estudio te ha pasado un enlace o un QR?')).toHaveCount(0);
  await expect(page.locator('svg.t-logo')).toHaveCount(0);
  await expect(page.locator('[data-avatar-estudio]').first()).toBeVisible();
});

test('con sesión, la alumna del estudio entra directa en él, sin lista', async ({ page }) => {
  await comoApp(page, 'app.tentare.luz');
  await conSesion(page);
  await appDeEstudio(page, () => ({ status: 200, body: APP_LUZ }));
  let misEstudios = 0;
  await page.route('**/api/app/mis-estudios', (r) => {
    misEstudios++;
    return r.fulfill(json({ estudios: [
      { slug: 'luz-pilates', nombre: 'Luz Pilates', como: 'alumna', ciudad: 'Sevilla', icono: APP_LUZ.icono },
      { slug: 'otro-estudio', nombre: 'Otro Estudio', como: 'alumna', ciudad: 'Madrid', icono: APP_LUZ.icono },
    ], nombre: 'Lucía' }));
  });

  await page.goto('/app');
  await expect(page).toHaveURL(/\/portal\/luz-pilates(\/|$|\?)/, { timeout: 60_000 });
  // Preguntó de verdad por sus estudios, y la lista nunca se enseñó.
  expect(misEstudios).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toHaveCount(0);
});

test('con sesión pero sin ser alumna de ese estudio: a darse de alta en él', async ({ page }) => {
  await comoApp(page, 'app.tentare.luz');
  await conSesion(page);
  await appDeEstudio(page, () => ({ status: 200, body: APP_LUZ }));
  let misEstudios = 0;
  await page.route('**/api/app/mis-estudios', (r) => {
    misEstudios++;
    return r.fulfill(json({ estudios: [{ slug: 'otro-estudio', nombre: 'Otro Estudio', como: 'alumna', ciudad: 'Madrid', icono: APP_LUZ.icono }], nombre: 'Lucía' }));
  });

  await page.goto('/app');
  await expect(page).toHaveURL(/\/portal\/luz-pilates\/acceso\/registro/, { timeout: 60_000 });
  expect(misEstudios).toBeGreaterThan(0);
});

test('un bundle de estudio SIN fila activa es la app «Tentare» de siempre', async ({ page }) => {
  await comoApp(page, 'app.tentare.apagada');
  const n = await appDeEstudio(page, () => ({ status: 404, body: { error: 'Esa app no está activa' } }));

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Reserva en tu estudio' })).toBeVisible({ timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Buscar mi estudio' })).toBeVisible();
});

test('si no se puede comprobar la app del estudio, lo dice y NO cae al selector de Tentare', async ({ page }) => {
  await comoApp(page, 'app.tentare.luz');
  const n = await appDeEstudio(page, () => ({ status: 500, body: { error: 'x' } }));

  await page.goto('/app');
  await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido cargar tus estudios' })).toBeVisible({ timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Reserva en tu estudio' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('la app «Tentare» y la web no preguntan por ningún estudio', async ({ page }) => {
  await comoApp(page, 'app.tentare');
  const n = await appDeEstudio(page, () => ({ status: 200, body: APP_LUZ }));

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Reserva en tu estudio' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Buscar mi estudio' })).toBeVisible();
  await expect(page.locator('svg.t-logo')).toBeVisible();
  expect(n.pedidas).toBe(0);
});
