import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type BrowserContext, type Request, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El acceso desde el widget sin marco, con la web del estudio en OTRO SITIO que
// Tentare (16-oct-2026).
//
// En producción nadie podía entrar ni darse de alta desde la nativa en ninguna
// web: la site key de Turnstile solo da token en tentare.app (en la web del
// estudio contesta 110200, «dominio no autorizado») y gotrue exige el captcha
// en todo acceso. Ahora el widget abre una ventana de Tentare
// (/widget-auth-retorno) y le encarga el acceso; allí corre el captcha.
//
// Lo distinto de esta spec: la web del estudio es `127.0.0.1` y la app es
// `localhost`, dos SITIOS distintos de verdad —el resto de specs de la nativa
// sirve las dos con `page.route`—, y la ventana del puente es la página REAL de
// la app, con su destino resuelto en servidor (semilla E2E en
// app/widget-auth-retorno/page.tsx: el estudio `tentare` autoriza
// http://127.0.0.1:4599 y nada más). gotrue va mockeado con `context.route`
// para que alcance también a la ventana, y en cada camino se CUENTA quién llama.
//
// Con el bundle REAL (`public/widget.js`, lo genera `npm run build:widget`).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(150_000);

const ANFITRIONA = 'http://127.0.0.1:4599';
const NO_AUTORIZADA = 'http://127.0.0.1:4600';
const SLUG = 'tentare';
const S = 'studio-test';
const BUNDLE = path.resolve('public/widget.js');

test.beforeAll(() => {
  expect(fs.existsSync(BUNDLE), 'Falta public/widget.js: genera el bundle con `npm run build:widget`.').toBe(true);
});

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Un access token con la forma de gotrue: `amr` con método y fecha, y `exp` en el futuro. */
function tokenDe(metodo: 'password' | 'otp'): string {
  const ahora = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'auth-e2e-nativa', email: 'socia@example.com', aud: 'authenticated', role: 'authenticated',
    aal: 'aal1', amr: [{ method: metodo, timestamp: ahora }], session_id: 'ses-e2e', iat: ahora, exp: ahora + 3600,
  })}.firma-falsa`;
}

const USUARIO = {
  id: 'auth-e2e-nativa', email: 'socia@example.com', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', factors: [],
};

function datosEstudio() {
  return {
    studio: {
      id: S, nombre: 'Estudio de pruebas', slug: SLUG, ciudad: 'Málaga', direccion: 'Calle Test 1', email: 'hola@example.com',
      telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, colorPrimario: '#7A2E4F',
      politicaPrivacidad: 'Política de pruebas.', terminosServicio: 'Condiciones de pruebas.',
    },
    tiposClase: [], salas: [], instructores: [], spots: [], planesTarifa: [], sustitucionesConfirmadas: [], sesiones: [],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [], aforoReservas: [],
  };
}

interface Contadores {
  /** Peticiones de acceso a gotrue (contraseña, correo), con el origen desde el que salieron. */
  acceso: { url: string; origen: string | undefined; cuerpo: string | null }[];
  /** Cualquier petición a Turnstile hecha DESDE la web del estudio. */
  turnstileEnLaWeb: number;
}

/**
 * La web del estudio con el widget, en `origen`. Todo lo de la app que pide la
 * web va por `page.route`; gotrue, por `context.route` (alcanza a la ventana).
 */
async function enLaWebDelEstudio(page: Page, context: BrowserContext, app: string, origen = ANFITRIONA, opciones: {
  token?: (r: Route) => Promise<void>;
  otp?: (r: Route) => Promise<void>;
} = {}): Promise<Contadores> {
  const c: Contadores = { acceso: [], turnstileEnLaWeb: 0 };
  const cors = {
    'access-control-allow-origin': origen, 'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
  };
  const responder = (r: Route, cuerpo: unknown, status = 200) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(cuerpo) });
  const anotar = (req: Request) => c.acceso.push({ url: req.url(), origen: req.headers().origin, cuerpo: req.postData() });

  // gotrue, para la web Y para la ventana. Nunca la red real.
  const gotrueCors = (req: Request) => ({
    'access-control-allow-origin': req.headers().origin ?? '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  await context.route(/\/auth\/v1\//, async (r) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: gotrueCors(req) });
    const url = req.url();
    if (url.includes('/auth/v1/token?grant_type=password')) {
      anotar(req);
      if (opciones.token) return opciones.token(r);
      const access = tokenDe('password');
      return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: JSON.stringify({
        access_token: access, refresh_token: 'refresh-e2e-nativa', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: USUARIO,
      }) });
    }
    if (url.includes('/auth/v1/otp')) {
      anotar(req);
      if (opciones.otp) return opciones.otp(r);
      return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: '{}' });
    }
    if (url.includes('/auth/v1/user')) {
      return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: JSON.stringify(USUARIO) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: '{}' });
  });
  await context.routeWebSocket(/\/realtime\/v1\//, () => {});

  page.on('request', (req) => { if (req.url().startsWith('https://challenges.cloudflare.com')) c.turnstileEnLaWeb++; });
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route(`${app}/api/public/**`, r => responder(r, { ok: true }));
  await page.route(`${app}/widget.js`, r => r.fulfill({ path: BUNDLE, contentType: 'text/javascript' }));
  await page.route(`${app}/widget-fuentes/**`, r => r.fulfill({ status: 404 }));
  await page.route(`${app}/api/public/studio-data**`, r => responder(r, datosEstudio()));
  await page.route(`${app}/api/public/session**`, r => responder(r, {
    socioId: 'socio-e2e-nativa', nombre: 'Socia Prueba', email: 'socia@example.com',
    aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null },
  }));
  await page.route(`${origen}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estudio</title></head><body style="margin:0;padding:24px"><h1>Horarios</h1><div data-tentare-booking data-studio="${SLUG}"></div><script src="${app}/widget.js" async></script></body></html>`,
  }));
  await page.goto(`${origen}/horarios`);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click({ timeout: 60_000 });
  await expect(page.getByText('Inicia sesión para reservar')).toBeVisible();
  return c;
}

test('con contraseña: la ventana de Tentare entra (desde tentare, no desde la web) y el widget queda dentro', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app);
  await page.getByPlaceholder('Email').fill('socia@example.com');
  await page.getByPlaceholder('Contraseña').fill('una-clave-de-pruebas');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const ventana = await ventanaPromesa;

  // La ventana es la página de Tentare, y el origen que lleva es el de la web.
  const url = new URL(ventana.url());
  expect(url.origin).toBe(app);
  expect(url.pathname).toBe('/widget-auth-retorno');
  expect(url.searchParams.get('origenEstudio')).toBe(ANFITRIONA);
  // Ni el email ni la contraseña viajan en la URL.
  expect(ventana.url()).not.toContain('socia');
  expect(ventana.url()).not.toContain('una-clave');

  // Se cierra sola en cuanto entrega la sesión, y el widget queda dentro.
  await ventana.waitForEvent('close', { timeout: 90_000 });
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Inicia sesión para reservar')).toHaveCount(0);

  // UNA petición de acceso, y salió de la ventana de Tentare, no de la web del estudio.
  expect(c.acceso).toHaveLength(1);
  expect(c.acceso[0].url).toContain('grant_type=password');
  expect(c.acceso[0].origen).toBe(app);
  expect(c.acceso[0].cuerpo).toContain('una-clave-de-pruebas');
  // La web del estudio no carga Turnstile: allí no da token (110200).
  expect(c.turnstileEnLaWeb).toBe(0);
});

test('con contraseña equivocada: gotrue dice que no, el widget lo dice y no entra', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app, ANFITRIONA, {
    token: (r) => r.fulfill({
      status: 400, contentType: 'application/json',
      headers: { 'access-control-allow-origin': r.request().headers().origin ?? '*' },
      body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
    }),
  });
  await page.getByPlaceholder('Email').fill('socia@example.com');
  await page.getByPlaceholder('Contraseña').fill('mal');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const ventana = await ventanaPromesa;
  await ventana.waitForEvent('close', { timeout: 90_000 });

  await expect(page.getByRole('alert')).toHaveText('Email o contraseña incorrectos.');
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toHaveCount(0);
  // Sí se intentó (sin contador, «no entró» podría ser «no lo intentó»).
  expect(c.acceso.length).toBeGreaterThan(0);
  expect(c.acceso.every(a => a.origen === app)).toBe(true);
});

test('sin contraseña: la ventana manda el correo con su captcha y vuelve a sí misma con el mismo intento', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app);
  await page.getByRole('button', { name: 'No tengo contraseña — enviarme un enlace' }).click();
  await page.getByPlaceholder('Email').fill('nueva@example.com');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Enviarme un enlace por email' }).click();
  const ventana = await ventanaPromesa;
  await expect(page.getByText('Te hemos escrito a')).toBeVisible({ timeout: 90_000 });
  await expect(ventana.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await expect(ventana.getByText('nueva@example.com')).toBeVisible();

  expect(c.acceso).toHaveLength(1);
  expect(c.acceso[0].url).toContain('/auth/v1/otp');
  expect(c.acceso[0].origen).toBe(app);
  // La vuelta del correo es la ventana del puente, con el nonce de ESTE intento.
  const nonce = new URL(ventana.url()).searchParams.get('nonce')!;
  const cuerpo = JSON.parse(c.acceso[0].cuerpo ?? '{}') as { email?: string };
  expect(cuerpo.email).toBe('nueva@example.com');
  const redirect = new URL(c.acceso[0].url).searchParams.get('redirect_to') ?? '';
  expect(redirect).toContain(`${app}/widget-auth-retorno`);
  expect(new URL(redirect).searchParams.get('nonce')).toBe(nonce);
  expect(new URL(redirect).searchParams.get('origenEstudio')).toBe(ANFITRIONA);
  expect(c.turnstileEnLaWeb).toBe(0);
  await ventana.close();
});

test('si el navegador bloquea la ventana: ofrece la página de reservas y no llama a gotrue', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  await page.addInitScript(() => {
    const w = window as unknown as { __aperturas: number; open: typeof window.open };
    w.__aperturas = 0;
    w.open = () => { w.__aperturas++; return null; };
  });
  const c = await enLaWebDelEstudio(page, context, app);
  await page.getByPlaceholder('Email').fill('socia@example.com');
  await page.getByPlaceholder('Contraseña').fill('una-clave-de-pruebas');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  const aviso = page.getByTestId('widget-acceso-sin-ventana');
  await expect(aviso).toContainText('Tu navegador no ha dejado abrir la ventana para entrar.');
  await expect(aviso.getByRole('link')).toHaveAttribute('href', `${app}/reservar/${SLUG}`);
  // Intentó abrirla (si no, «no llamó a gotrue» no probaría nada) y no hubo acceso.
  expect(await page.evaluate(() => (window as unknown as { __aperturas: number }).__aperturas)).toBe(1);
  expect(c.acceso).toHaveLength(0);
});

test('desde una web que el estudio NO autorizó: la ventana no acepta el encargo ni llama a gotrue', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app, NO_AUTORIZADA);
  await page.getByPlaceholder('Email').fill('socia@example.com');
  await page.getByPlaceholder('Contraseña').fill('una-clave-de-pruebas');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const ventana = await ventanaPromesa;

  // El servidor no da destino: la ventana no tiene a quién hablar.
  await expect(ventana.getByText('No hemos podido confirmar el acceso automáticamente.')).toBeVisible({ timeout: 90_000 });
  await ventana.waitForTimeout(1_500);
  expect(c.acceso).toHaveLength(0);
  // Y al cerrarla, el widget ofrece la salida.
  await ventana.close();
  await expect(page.getByTestId('widget-acceso-sin-ventana')).toContainText('se ha cerrado antes de terminar');
  expect(c.acceso).toHaveLength(0);
});
