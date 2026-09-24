import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista } from './socia-lista';
import { tokenDeSesion } from './enlace-de-correo';

// Una alumna que crea su cuenta en la app del estudio recibe un correo con un
// CÓDIGO de 6 cifras, no un enlace: la plantilla de «confirma tu correo» es
// común a todo el proyecto y solo trae el código. La pantalla le decía «te
// hemos enviado un enlace» y no tenía dónde escribirlo, así que ninguna alumna
// nueva podía terminar el alta (lo reportó un estudio probándolo).

const base = `/portal/${SLUG}`;
const CODIGO_BUENO = '482913';

type Contadores = { altas: number; intentos: string[]; fichas: Record<string, unknown>[] };

async function montar(page: Page): Promise<Contadores> {
  const c: Contadores = { altas: 0, intentos: [], fichas: [] };
  // SIN sesión sembrada: es una alumna nueva.
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'studio-test' }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
  await page.route('**/api/public/aforo**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sesionIds: [], aforoReservas: [] }) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  // Sin ficha hasta que se firme el alta; después, la ficha nueva.
  await page.route((u) => u.pathname === '/api/public/session', (r) => (c.fichas.length
    ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ socioId: 'socio-nueva', nombre: 'Ana Nueva', email: 'nueva@example.com' }) })
    : r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"sin ficha"}' })));
  await page.route((u) => u.pathname === '/api/public/socio', (r) => {
    c.fichas.push(JSON.parse(r.request().postData() ?? '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'socio-nueva' }) });
  });
  // gotrue: el alta no abre sesión (hay que confirmar el correo).
  await page.route('**/auth/v1/signup*', (r) => {
    c.altas++;
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'auth-nueva', email: 'nueva@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-24T10:00:00Z' }) });
  });
  await page.route('**/auth/v1/user*', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'auth-nueva', email: 'nueva@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-24T10:00:00Z' }) }));
  await page.route('**/api/auth/otp/verificar', (r) => {
    const { email, token } = r.request().postDataJSON() as { email: string; token: string };
    c.intentos.push(token);
    if (email === 'nueva@example.com' && token === CODIGO_BUENO) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, session: { access_token: tokenDeSesion('auth-nueva'), refresh_token: 'e2e-refresh' } }) });
    }
    return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'El código no es correcto o ha caducado. Comprueba el código o solicita uno nuevo.', errorCode: 'INVALIDO' }) });
  });
  return c;
}

/**
 * Abre una pantalla de acceso y espera a que React la haya hidratado: escribir
 * antes se pierde (el campo controlado vuelve a su valor inicial). No hay señal
 * directa; la petición del catálogo la lanza el cliente ya montado.
 */
async function abrir(page: Page, ruta: string) {
  const hidratada = page.waitForRequest((r) => r.url().includes('/api/public/studio-data'), { timeout: 60_000 });
  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
  await hidratada;
}

async function crearCuenta(page: Page) {
  await abrir(page, '/acceso/registro');
  await page.getByLabel('Nombre').fill('Ana Nueva', { timeout: 30_000 });
  await page.getByLabel('Email', { exact: true }).fill('nueva@example.com');
  await page.getByLabel('Contraseña').fill('unaClaveLarga1');
  await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).click();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
}

test.describe('Alta de alumna con el código del correo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('crea la cuenta, escribe el código y queda dada de alta en el estudio', async ({ page }) => {
    const c = await montar(page);
    await crearCuenta(page);

    // La pantalla pide el código, no promete un enlace que no llega.
    const codigo = page.getByTestId('codigo-correo');
    await expect(codigo).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/código de 6 cifras/)).toBeVisible();
    await expect(page.getByText(/te hemos enviado un enlace/i)).toHaveCount(0);
    expect(c.altas, 'el alta tenía que llegar a gotrue').toBe(1);

    // El autocompletado del móvil lo pone de golpe; con las seis cifras se comprueba solo.
    await codigo.fill(CODIGO_BUENO);

    // Con la sesión abierta, se firma el alta en el estudio con lo que escribió.
    await expect.poll(() => c.fichas.length, { timeout: 30_000 }).toBe(1);
    expect(c.fichas[0].nombre).toBe('Ana Nueva');
    expect(c.intentos).toEqual([CODIGO_BUENO]);
    // Y sale de las pantallas de acceso.
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 30_000 });
  });

  test('tras el código NO pide «elige tu contraseña» a quien ya la puso al registrarse', async ({ page }) => {
    // Mientras se firmaba el alta (2-3 s en un móvil real), la pantalla pintaba
    // su formulario de contraseña por defecto, y la alumna dudaba de si la había
    // puesto. Se retrasa la firma a propósito para que ese rato exista en el test.
    const c = await montar(page);
    await page.route((u) => u.pathname === '/api/public/socio', async (r) => {
      await new Promise((fin) => setTimeout(fin, 2_500));
      c.fichas.push(JSON.parse(r.request().postData() ?? '{}'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'socio-nueva' }) });
    });
    // Anota qué llega a pintarse en CUALQUIER momento, no solo al final.
    await page.addInitScript(() => {
      const w = window as unknown as { __vioElegir?: boolean; __vioEntrando?: boolean };
      new MutationObserver(() => {
        const texto = document.body?.innerText ?? '';
        if (texto.includes('Elige tu contraseña')) w.__vioElegir = true;
        if (texto.includes('Entrando en')) w.__vioEntrando = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await crearCuenta(page);

    const codigo = page.getByTestId('codigo-correo');
    await expect(codigo).toBeVisible({ timeout: 30_000 });
    await codigo.fill(CODIGO_BUENO);

    await expect.poll(() => c.fichas.length, { timeout: 30_000 }).toBe(1);
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 30_000 });
    const visto = await page.evaluate(() => {
      const w = window as unknown as { __vioElegir?: boolean; __vioEntrando?: boolean };
      return { elegir: !!w.__vioElegir, entrando: !!w.__vioEntrando };
    });
    expect(visto.elegir, 'no puede pedirle una contraseña que ya puso').toBe(false);
    // Y mientras se firmaba el alta, decía lo que estaba pasando.
    expect(visto.entrando, 'el rato de espera tiene que decir que está entrando').toBe(true);
  });

  test('un código equivocado lo dice y no da de alta a nadie', async ({ page }) => {
    const c = await montar(page);
    await crearCuenta(page);

    const codigo = page.getByTestId('codigo-correo');
    await expect(codigo).toBeVisible({ timeout: 30_000 });
    await codigo.fill('000000');

    await expect(page.getByText(/no es correcto o ha caducado/i)).toBeVisible();
    // Sin esto, «no dio de alta» podría ser «ni lo intentó».
    expect(c.intentos, 'el código tenía que comprobarse en el servidor').toEqual(['000000']);
    expect(c.fichas).toHaveLength(0);
    await expect(page).toHaveURL(/\/acceso\/verificar/);
  });

  test('«entrar con enlace» con un email nuevo también deja escribir el código', async ({ page }) => {
    // Con un email sin cuenta confirmada, pedir el enlace de acceso crea la
    // cuenta y gotrue manda el correo de ALTA, con código — no el enlace.
    const c = await montar(page);
    let envios = 0;
    await page.route('**/auth/v1/otp*', (r) => { envios++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }); });

    await page.goto(`${base}/acceso/login`, { waitUntil: 'domcontentloaded' });
    // Esta pantalla no da ninguna señal de estar ya montada (ver
    // student-acceso.spec.ts), y lo escrito antes se pierde: se reintenta
    // escribir y pedir el correo hasta que aparece el paso siguiente.
    const codigo = page.getByTestId('codigo-correo');
    await expect(async () => {
      await page.getByLabel('Email', { exact: true }).fill('nueva@example.com');
      await page.getByRole('button', { name: /mándame un enlace/i }).click();
      await expect(codigo).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    expect(envios, 'tenía que salir el correo').toBeGreaterThan(0);
    await codigo.fill(CODIGO_BUENO);

    // Con sesión y sin ficha ni firma, le pide lo único que falta: su nombre y el consentimiento.
    await expect(page).toHaveURL(/\/acceso\/registro\?firma=1/, { timeout: 30_000 });
    expect(c.intentos).toEqual([CODIGO_BUENO]);
  });
});
