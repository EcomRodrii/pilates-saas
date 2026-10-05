import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista } from './socia-lista';
import { tokenDeSesion } from './enlace-de-correo';

// Entrar en el estudio con el correo y un código en casillas (P08): una sola
// puerta para quien ya es alumna y para quien llega nueva; a la nueva, y solo a
// ella, «Tus datos» con la privacidad DEL ESTUDIO. La contraseña sigue, como
// segunda opción.
//
// Cada camino cuenta lo que pide de verdad: un «no entró» sin contador puede ser
// verde por no haber intentado nada (e2e/socia-lista.ts).

const base = `/portal/${SLUG}`;
const CODIGO_BUENO = '482913';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(b) });
const PRIVACIDAD = 'Política de privacidad de Estudio Alma: tus datos los trata el estudio para gestionar tus reservas.';

type Contadores = { envios: { email?: string; create_user?: boolean }[]; intentos: string[]; fichas: Record<string, unknown>[]; contrasenas: number };

/** `conocida`: el estudio ya la tiene de alumna. Si no, no tiene ficha hasta que firma el alta. */
async function montar(page: Page, { conocida = false } = {}): Promise<Contadores> {
  const c: Contadores = { envios: [], intentos: [], fichas: [], contrasenas: 0 };
  const usuario = { id: 'auth-ana', email: 'ana@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T10:00:00Z' };
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  // El texto legal DEL ESTUDIO, el que se firma (studioPublico ya lo compone).
  Object.assign(f.studio as Record<string, unknown>, { politicaPrivacidad: PRIVACIDAD, terminosServicio: 'Condiciones de Estudio Alma.' });

  await page.route('**/rest/v1/**', (r) => r.fulfill(json({ id: STUDIO_ID })));
  await page.route('**/api/theme**', (r) => r.fulfill(json({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 })));
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [], aforoReservas: [] })));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  await page.route((u) => u.pathname === '/api/public/session', (r) => (conocida || c.fichas.length
    ? r.fulfill(json({ socioId: 'socio-ana', nombre: 'Ana', email: 'ana@example.com' }))
    : r.fulfill(json({ error: 'sin ficha' }, 404))));
  // No es instructora del estudio ni tiene invitación: `/acceso/verificar` lo
  // pregunta antes de decidir, y sin respuesta se quedaría en «Entrando…».
  await page.route('**/api/portal/instructora/sesion', (r) => r.fulfill(json({ invitacionPendiente: false }, 404)));
  await page.route((u) => u.pathname === '/api/public/socio', (r) => {
    c.fichas.push(r.request().postDataJSON() ?? {});
    return r.fulfill(json({ id: 'socio-ana' }));
  });
  // gotrue: el correo con el código (crea la cuenta si no existe), el usuario y la contraseña.
  await page.route('**/auth/v1/otp*', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    c.envios.push(r.request().postDataJSON() ?? {});
    return r.fulfill(json({}));
  });
  await page.route('**/auth/v1/user*', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: CORS }) : r.fulfill(json(usuario)));
  await page.route('**/auth/v1/token*', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    c.contrasenas++;
    return r.fulfill(json({ access_token: tokenDeSesion('auth-ana', 'password'), refresh_token: 'e2e-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: usuario }));
  });
  // El código: el bueno abre la sesión; uno malo, el 400 del servidor con los intentos que quedan.
  await page.route('**/api/auth/otp/verificar', (r) => {
    const { token } = r.request().postDataJSON() as { token: string };
    c.intentos.push(token);
    return token === CODIGO_BUENO
      ? r.fulfill(json({ ok: true, session: { access_token: tokenDeSesion('auth-ana'), refresh_token: 'e2e-refresh' } }))
      : r.fulfill(json({ error: 'El código no es correcto o ha caducado. Comprueba el código o solicita uno nuevo.', errorCode: 'INVALIDO', intentosRestantes: 4 }, 400));
  });
  return c;
}

/**
 * Escribe el correo y pulsa «Seguir» hasta que aparecen las casillas. La pantalla
 * no da señal de estar hidratada y lo escrito antes se pierde (student-acceso):
 * se reintenta, y el contador de correos dice cuántos salieron de verdad.
 */
async function pedirCodigo(page: Page, ruta = '/acceso/login') {
  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
  const primera = page.getByTestId('codigo-correo');
  await expect(async () => {
    await page.getByLabel('Tu correo').fill('ana@example.com');
    await page.getByRole('button', { name: 'Seguir', exact: true }).click();
    await expect(primera).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  return primera;
}

test.describe('Entrar en el estudio con el código del correo', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('código mal: lo dice con los intentos que quedan; con el bueno, la alumna conocida entra sin más', async ({ page }) => {
    const c = await montar(page, { conocida: true });
    await expect(page.getByRole('heading', { name: 'Mira tu correo' })).toHaveCount(0);
    const primera = await pedirCodigo(page);

    await expect(page.getByRole('heading', { name: 'Mira tu correo' })).toBeVisible();
    // El correo, tapado por delante y con el dominio entero, y la caducidad.
    await expect(page.getByText(/a•••@example\.com/)).toBeVisible();
    await expect(page.getByText(/Caduca en 10 minutos/)).toBeVisible();
    // Un solo correo, con permiso para crear la cuenta: entrar y darse de alta es la misma puerta.
    expect(c.envios.length).toBeGreaterThan(0);
    expect(c.envios[c.envios.length - 1]).toMatchObject({ email: 'ana@example.com', create_user: true });
    // Y la cuenta atrás del reenvío, a la vista.
    await expect(page.getByTestId('reenviar-espera')).toContainText(/reenviar en 00:\d\d/);

    // Seis casillas que admiten pegar el código entero de golpe (lo que hace iOS).
    await expect(page.getByRole('group', { name: /Código de verificación/ }).getByRole('textbox')).toHaveCount(6);
    await primera.fill('000000');
    await expect(page.getByTestId('error-codigo')).toHaveText('Ese código no es. Te quedan 4 intentos.');
    expect(c.intentos, 'el código tenía que comprobarse en el servidor').toEqual(['000000']);
    await expect(page.getByTestId('codigo-correo')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/acceso\/login/);
    expect(c.fichas).toHaveLength(0);

    // Con las seis cifras buenas entra sola, sin pulsar, y sin pasar por «Tus datos».
    await page.getByTestId('codigo-correo').fill(CODIGO_BUENO);
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 120_000 });
    expect(c.intentos).toEqual(['000000', CODIGO_BUENO]);
    expect(c.fichas, 'ya era alumna: no se le da de alta otra vez').toHaveLength(0);
  });

  test('nueva en el estudio: después del código, «Tus datos» con la privacidad DEL ESTUDIO, y la da de alta', async ({ page }) => {
    const c = await montar(page);
    const primera = await pedirCodigo(page);
    await primera.fill(CODIGO_BUENO);

    // Solo a la nueva: la tira de pasos y sus datos.
    await expect(page).toHaveURL(/\/acceso\/registro\?firma=1&via=codigo/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pasos para entrar' })).toContainText('Tus datos');
    // Sin contraseña: se crea después, si se quiere.
    await expect(page.getByLabel('Contraseña')).toHaveCount(0);

    // El texto que se acepta es el del estudio, en una hoja, no la política de Tentare.
    await page.getByRole('button', { name: 'las condiciones y la política de privacidad' }).click();
    await expect(page.getByTestId('texto-legal-estudio')).toContainText(PRIVACIDAD);
    // Y la hoja sale con el kit del estudio: dentro de `.student-app`, no suelta en <body> sin estilo.
    await expect(page.locator('.student-app').getByTestId('texto-legal-estudio')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

    // Sin aceptar no se da de alta a nadie (y sin contador, «no la dio de alta» no diría nada).
    await page.getByLabel('Nombre').fill('Ana Nueva');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Necesitamos tu consentimiento')).toBeVisible();
    expect(c.fichas).toHaveLength(0);

    await page.getByRole('checkbox', { name: /Acepto las condiciones y la política de privacidad/ }).click();
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect.poll(() => c.fichas.length, { timeout: 60_000 }).toBe(1);
    expect(c.fichas[0]).toMatchObject({ accion: 'registrar', nombre: 'Ana Nueva' });
    // Lo firmado es el texto del estudio, entero.
    expect(String((c.fichas[0].aceptacion as { versionTexto?: string }).versionTexto)).toContain(PRIVACIDAD);
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 120_000 });
  });

  test('la contraseña sigue funcionando, como segunda opción', async ({ page }) => {
    const c = await montar(page, { conocida: true });
    await page.goto(`${base}/acceso/login`, { waitUntil: 'domcontentloaded' });
    await expect(async () => {
      await page.getByRole('button', { name: 'Usar mi contraseña' }).click();
      await expect(page.getByRole('heading', { name: 'Entra con tu contraseña' })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000 });
    await page.getByLabel('Email').fill('ana@example.com');
    await page.getByLabel('Contraseña').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect.poll(() => c.contrasenas, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 120_000 });
    // Por la contraseña no sale ningún correo.
    expect(c.envios).toHaveLength(0);
  });
});
