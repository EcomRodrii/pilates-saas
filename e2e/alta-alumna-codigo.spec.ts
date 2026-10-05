import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista } from './socia-lista';
import { tokenDeSesion } from './enlace-de-correo';

// Una alumna que se da de alta en la app del estudio recibe un correo con un
// CÓDIGO de 6 cifras, no un enlace: las plantillas del proyecto solo traen el
// código. La pantalla le decía «te hemos enviado un enlace» y no tenía dónde
// escribirlo, así que ninguna alumna nueva podía terminar el alta (lo reportó un
// estudio probándolo).
//
// Desde P08 (5-oct-2026) el alta es la misma puerta que entrar: correo → código
// en casillas → «Tus datos» (nombre y la privacidad del estudio), sin contraseña.

const base = `/portal/${SLUG}`;
const CODIGO_BUENO = '482913';

type Contadores = { envios: number; intentos: string[]; fichas: Record<string, unknown>[] };

async function montar(page: Page): Promise<Contadores> {
  const c: Contadores = { envios: 0, intentos: [], fichas: [] };
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
  // gotrue: el correo con el código (crea la cuenta si no existe; no abre sesión).
  await page.route('**/auth/v1/otp*', (r) => {
    c.envios++;
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
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
 * Abre la puerta, escribe el correo y pide el código hasta que salen las
 * casillas. Esta pantalla no da ninguna señal de estar ya montada (ver
 * student-acceso.spec.ts), y lo escrito antes se pierde: se reintenta.
 */
async function pedirCodigo(page: Page, ruta: string) {
  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
  const codigo = page.getByTestId('codigo-correo');
  await expect(async () => {
    await page.getByLabel('Tu correo').fill('nueva@example.com');
    await page.getByRole('button', { name: 'Seguir', exact: true }).click();
    await expect(codigo).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  return codigo;
}

/** «Tus datos»: el nombre y el consentimiento, que es lo único que le falta a una alumna nueva. */
async function rellenarTusDatos(page: Page) {
  await expect(page).toHaveURL(/\/acceso\/registro\?firma=1/, { timeout: 30_000 });
  await page.getByLabel('Nombre').fill('Ana Nueva', { timeout: 30_000 });
  await page.getByRole('checkbox', { name: /Acepto las condiciones y la política de privacidad/ }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test.describe('Alta de alumna con el código del correo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('pide el código, escribe sus datos y queda dada de alta en el estudio', async ({ page }) => {
    const c = await montar(page);
    const codigo = await pedirCodigo(page, '/acceso/registro');

    // La pantalla pide el código, no promete un enlace que no llega.
    await expect(page.getByText(/Te hemos mandado un código/)).toBeVisible();
    await expect(page.getByText(/te hemos enviado un enlace/i)).toHaveCount(0);
    expect(c.envios, 'el correo tenía que salir de gotrue').toBeGreaterThan(0);

    // El autocompletado del móvil lo pone de golpe; con las seis cifras se comprueba solo.
    await codigo.fill(CODIGO_BUENO);
    await rellenarTusDatos(page);

    // Con la sesión abierta, se firma el alta en el estudio con lo que escribió.
    await expect.poll(() => c.fichas.length, { timeout: 30_000 }).toBe(1);
    expect(c.fichas[0].nombre).toBe('Ana Nueva');
    expect(c.intentos).toEqual([CODIGO_BUENO]);
    // Y sale de las pantallas de acceso.
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 30_000 });
  });

  test('tras el código y sus datos NO le pide «elige tu contraseña»', async ({ page }) => {
    // Mientras se firmaba el alta (2-3 s en un móvil real), la pantalla pintaba
    // su formulario de contraseña por defecto, y la alumna dudaba de si tenía
    // que poner una. Se retrasa la firma a propósito para que ese rato exista.
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
    const codigo = await pedirCodigo(page, '/acceso/registro');
    await codigo.fill(CODIGO_BUENO);
    await rellenarTusDatos(page);

    await expect.poll(() => c.fichas.length, { timeout: 30_000 }).toBe(1);
    await expect(page).not.toHaveURL(/\/acceso\//, { timeout: 30_000 });
    const visto = await page.evaluate(() => {
      const w = window as unknown as { __vioElegir?: boolean; __vioEntrando?: boolean };
      return { elegir: !!w.__vioElegir, entrando: !!w.__vioEntrando };
    });
    expect(visto.elegir, 'no puede pedirle una contraseña que nadie le ha pedido').toBe(false);
    // Y mientras se firmaba el alta, decía lo que estaba pasando.
    expect(visto.entrando, 'el rato de espera tiene que decir que está entrando').toBe(true);
  });

  test('un código equivocado lo dice y no da de alta a nadie', async ({ page }) => {
    const c = await montar(page);
    const codigo = await pedirCodigo(page, '/acceso/registro');
    await codigo.fill('000000');

    await expect(page.getByText(/Ese código no es/)).toBeVisible();
    // Sin esto, «no dio de alta» podría ser «ni lo intentó».
    expect(c.intentos, 'el código tenía que comprobarse en el servidor').toEqual(['000000']);
    expect(c.fichas).toHaveLength(0);
    await expect(page).toHaveURL(/\/acceso\/registro/);
    await expect(page.getByRole('heading', { name: 'Tus datos' })).toHaveCount(0);
  });

  test('desde «Entra en…» con un email nuevo también: código y, después, sus datos', async ({ page }) => {
    // Con un email sin cuenta, el código crea la cuenta: entrar y darse de alta
    // es la misma puerta.
    const c = await montar(page);
    const codigo = await pedirCodigo(page, '/acceso/login');
    expect(c.envios, 'tenía que salir el correo').toBeGreaterThan(0);
    await codigo.fill(CODIGO_BUENO);

    // Con sesión y sin ficha ni firma, le pide lo único que falta: su nombre y el consentimiento.
    await expect(page).toHaveURL(/\/acceso\/registro\?firma=1/, { timeout: 30_000 });
    expect(c.intentos).toEqual([CODIGO_BUENO]);
  });
});
