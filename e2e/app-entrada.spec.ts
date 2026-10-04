import { test, expect, type Page } from '@playwright/test';
import { tokenDeSesion } from './enlace-de-correo';

// La entrada de la app de iOS (`/app`, rediseño del 4-oct-2026): se entra con el
// email y un código; entrar y darse de alta es el mismo paso; con sesión, a sus
// estudios. Cada camino cuenta lo que pide de verdad: un «no ha pasado nada» sin
// contador puede ser verde por no haber intentado nada (e2e/socia-lista.ts).

test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 120_000 });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
const USUARIO = { id: 'auth-lucia', email: 'lucia@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

const ESTUDIOS = [
  { slug: 'alba-pilates', nombre: 'Alba Pilates', como: 'alumna', ciudad: 'Valencia', icono: '/icono-estudio?inicial=A&color=%237A8B6F&size=192' },
  { slug: 'nucleo-reformer', nombre: 'Núcleo Reformer', como: 'las-dos', ciudad: 'Madrid', icono: '/icono-estudio?inicial=N&color=%23B4537E&size=192' },
];

const FACTOR = { id: 'fac-1', factor_type: 'totp', status: 'verified', friendly_name: 'Tentare', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

/** gotrue y el usuario, mockeados; `conSesion` siembra una sesión ya abierta (con `conFactor`, con la verificación en dos pasos activada). */
async function montar(page: Page, { conSesion = false, conFactor = false } = {}) {
  const usuario = conFactor ? { ...USUARIO, factors: [FACTOR] } : USUARIO;
  await page.route('**/auth/v1/user*', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : r.fulfill(json(usuario)));
  if (conSesion) {
    await page.addInitScript(([token, usuario]) => {
      localStorage.setItem('sb-portal-auth', JSON.stringify({
        access_token: token, refresh_token: 'e2e-refresh', token_type: 'bearer', expires_at: 4102444800, expires_in: 999999999, user: usuario,
      }));
    }, [tokenDeSesion('auth-lucia'), usuario] as const);
  }
}

/** `/api/app/mis-estudios` con la respuesta que se pida, contando las veces. */
async function misEstudios(page: Page, responder: () => { status: number; body: unknown }) {
  const n = { pedidas: 0 };
  await page.route('**/api/app/mis-estudios', (r) => { n.pedidas++; const x = responder(); return r.fulfill(json(x.body, x.status)); });
  return n;
}

test('sin sesión: el email y el código la meten, y la saluda con sus estudios', async ({ page }) => {
  await montar(page);
  const pedidos: { create_user?: boolean; email?: string }[] = [];
  await page.route('**/auth/v1/otp*', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    pedidos.push(r.request().postDataJSON());
    return r.fulfill(json({}));
  });
  const intentos: string[] = [];
  await page.route('**/api/auth/otp/verificar', (r) => {
    const { token } = r.request().postDataJSON() as { token: string };
    intentos.push(token);
    return token === '482913'
      ? r.fulfill(json({ ok: true, session: { access_token: tokenDeSesion('auth-lucia'), refresh_token: 'e2e-refresh' } }))
      : r.fulfill(json({ error: 'El código no es correcto o ha caducado.' }, 400));
  });
  const n = await misEstudios(page, () => ({ status: 200, body: { estudios: ESTUDIOS, nombre: 'Lucía' } }));

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Reserva en tu estudio' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Email').fill('lucia@example.com');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await expect(page.getByRole('heading', { name: 'Mira tu correo' })).toBeVisible({ timeout: 30_000 });
  // Un solo correo, y con permiso para crear la cuenta: entrar y darse de alta es lo mismo.
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0]).toMatchObject({ email: 'lucia@example.com', create_user: true });

  // Un código mal: lo dice y no entra.
  await page.getByLabel('Código de 6 cifras').fill('111111');
  await expect(page.getByText('El código no es correcto o ha caducado.')).toBeVisible();
  expect(n.pedidas).toBe(0);

  // Con las seis cifras buenas entra sola, sin pulsar.
  await page.getByLabel('Código de 6 cifras').fill('482913');
  await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toBeVisible({ timeout: 30_000 });
  expect(intentos).toEqual(['111111', '482913']);
  expect(n.pedidas).toBeGreaterThan(0);
  await expect(page.locator('[data-estudio]')).toHaveCount(2);
  await expect(page.getByText('Alumna e instructora')).toBeVisible();
});

test('con la verificación en dos pasos sin pasar: pide el código, no la manda a entrar otra vez', async ({ page }) => {
  await montar(page, { conSesion: true, conFactor: true });
  const n = await misEstudios(page, () => ({ status: 403, body: { error: 'doble_factor_requerido' } }));
  let usar = 0;
  await page.route('**/api/auth/dispositivo-confianza/usar', (r) => { usar++; return r.fulfill(json({ confiada: false, nueva: false })); });
  await page.route('**/api/auth/doble-factor-correo/enviar', (r) => r.fulfill(json({ enviado: true })));

  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible({ timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
  await expect.poll(() => usar).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Reserva en tu estudio' })).toHaveCount(0);
});

test('«Cambiar de estudio» (?elegir=1) enseña la lista aunque solo tenga uno', async ({ page }) => {
  await montar(page, { conSesion: true });
  const n = await misEstudios(page, () => ({ status: 200, body: { estudios: ESTUDIOS.slice(0, 1), nombre: 'Lucía' } }));
  await page.goto('/app?elegir=1');
  await expect(page.getByRole('heading', { name: 'Hola, Lucía' })).toBeVisible({ timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/app\?elegir=1$/);
});

test('desde la ficha de un estudio donde aún no está: a darse de alta en él', async ({ page }) => {
  await montar(page, { conSesion: true });
  const n = await misEstudios(page, () => ({ status: 200, body: { estudios: ESTUDIOS.slice(0, 1), nombre: 'Lucía' } }));
  await page.goto('/app?estudio=estudio-brisa');
  await page.waitForURL(/\/portal\/estudio-brisa\/acceso\/registro/, { timeout: 60_000 });
  expect(n.pedidas).toBeGreaterThan(0);
});

test('sin estudios: lo dice, ofrece buscar y entrar con el email que tiene su estudio', async ({ page }) => {
  await montar(page, { conSesion: true });
  await misEstudios(page, () => ({ status: 200, body: { estudios: [], nombre: null } }));
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Aún no tienes estudio' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Entrar con otro email' })).toBeVisible();
  await expect(page.getByLabel('Nombre del estudio')).toBeVisible();
});

test('el buscador: resultados con su ciudad que llevan a la ficha, y un fallo no se disfraza de «no hay»', async ({ page }) => {
  await montar(page);
  let falla = false;
  const buscadas: string[] = [];
  await page.route('**/api/public/app/estudios?*', (r) => {
    buscadas.push(new URL(r.request().url()).searchParams.get('q') ?? '');
    return falla ? r.fulfill(json({ error: 'x' }, 500)) : r.fulfill(json({ estudios: [{ slug: 'nucleo-reformer', nombre: 'Núcleo Reformer', ciudad: 'Madrid', icono: ESTUDIOS[1].icono }] }));
  });

  await page.goto('/app');
  await page.getByRole('button', { name: 'Buscar mi estudio' }).click({ timeout: 60_000 });
  await page.getByLabel('Nombre del estudio').fill('nucleo');
  const resultado = page.locator('[data-encontrado="nucleo-reformer"]');
  await expect(resultado).toBeVisible({ timeout: 30_000 });
  await expect(resultado).toContainText('Madrid');
  await expect(resultado).toHaveAttribute('href', '/app/estudio/nucleo-reformer');
  expect(buscadas).toContain('nucleo');

  falla = true;
  await page.getByLabel('Nombre del estudio').fill('brisa');
  await expect(page.getByText('No hemos podido buscar.', { exact: false })).toBeVisible({ timeout: 30_000 });
  expect(buscadas).toContain('brisa');
  await expect(page.getByText('No sale ningún estudio con ese nombre')).toHaveCount(0);
});

test('la búsqueda pública no busca con menos de 3 letras', async ({ request }) => {
  const res = await request.get('/api/public/app/estudios?q=ab');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ estudios: [] });
});

test('Google en la web: va a Google y vuelve a la misma entrada, con el estudio que traía', async ({ page }) => {
  await montar(page);
  const idas: string[] = [];
  await page.route('**/auth/v1/authorize*', (r) => { idas.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' }); });

  await page.goto('/app?estudio=alba-pilates');
  await page.getByRole('button', { name: 'Continuar con Google' }).click({ timeout: 60_000 });
  await expect.poll(() => idas.length, { timeout: 30_000 }).toBe(1);
  const ida = new URL(idas[0]);
  expect(ida.searchParams.get('provider')).toBe('google');
  expect(new URL(ida.searchParams.get('redirect_to') ?? '').pathname + new URL(ida.searchParams.get('redirect_to') ?? '').search).toBe('/app?estudio=alba-pilates');
});
