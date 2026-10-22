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
  /** Preguntas de la ventana al servidor: «¿es de equipo?», con el token que llevaban. */
  cuenta: { origen: string | undefined; autorizacion: string | undefined }[];
  /**
   * Sesiones que llegan a la web del estudio: el widget abre la que le entregan
   * con `setSession`, que pregunta a gotrue por el usuario DESDE la web.
   */
  sesionEnLaWeb: number;
  /** Cierres de sesión en gotrue, con su URL (para ver el `scope`). */
  logout: string[];
  /** Refrescos de token, desde cualquier sitio. */
  refresco: number;
}

/**
 * La web del estudio con el widget, en `origen`. Todo lo de la app que pide la
 * web va por `page.route`; gotrue, por `context.route` (alcanza a la ventana).
 */
async function enLaWebDelEstudio(page: Page, context: BrowserContext, app: string, origen = ANFITRIONA, opciones: {
  token?: (r: Route) => Promise<void>;
  otp?: (r: Route) => Promise<void>;
  /** Lo que contesta `/api/auth/cuenta-de-equipo`. Por defecto, una alumna. */
  cuenta?: (r: Route) => Promise<void>;
} = {}): Promise<Contadores> {
  const c: Contadores = { acceso: [], turnstileEnLaWeb: 0, cuenta: [], sesionEnLaWeb: 0, logout: [], refresco: 0 };
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
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) c.refresco++;
    if (url.includes('/auth/v1/logout')) c.logout.push(url);
    if (url.includes('/auth/v1/user')) {
      if (req.headers().origin === origen) c.sesionEnLaWeb++;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: JSON.stringify(USUARIO) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', headers: gotrueCors(req), body: '{}' });
  });
  await context.routeWebSocket(/\/realtime\/v1\//, () => {});
  // La pregunta de la ventana antes de entregar: en servidor (Supabase), adonde
  // `page.route` no llega, así que se contesta aquí y se cuenta.
  await context.route(`${app}/api/auth/cuenta-de-equipo`, async (r) => {
    c.cuenta.push({ origen: r.request().headers().origin, autorizacion: r.request().headers().authorization });
    if (opciones.cuenta) return opciones.cuenta(r);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ equipo: false }) });
  });

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
  // Antes de entregar, la ventana preguntó al servidor con el token nuevo; y la
  // sesión que entrega no se cierra (sería cerrar también la del widget).
  expect(c.cuenta).toHaveLength(1);
  expect(c.cuenta[0].autorizacion).toMatch(/^Bearer /);
  expect(c.sesionEnLaWeb).toBeGreaterThan(0);
  expect(c.logout).toHaveLength(0);
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

// ── Las cuentas de equipo no entran por el widget (decisión del 16-oct-2026) ──
//
// La sesión que entrega la ventana vale para la cuenta entera: si es de alguien
// del equipo de un estudio, la web que la recibe podría usarla allí. La ventana
// pregunta al servidor antes de entregar y, si es de equipo, no entrega nada.
// Se cuenta lo que llega a la web: ninguna sesión.

const comoEquipo = (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ equipo: true }) });

test('cuenta de equipo con contraseña: la ventana no entrega la sesión, la cierra y lo dice con la salida a la página entera', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app, ANFITRIONA, { cuenta: comoEquipo });
  await page.getByPlaceholder('Email').fill('equipo@example.com');
  await page.getByPlaceholder('Contraseña').fill('una-clave-de-pruebas');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const ventana = await ventanaPromesa;

  // La ventana se queda abierta, con el porqué y la página de reservas entera.
  await expect(ventana.getByRole('heading', { name: 'Esta cuenta es de un equipo de Tentare: entra desde tentare.app.' })).toBeVisible({ timeout: 90_000 });
  await expect(ventana.getByRole('link', { name: 'entra desde la página de reservas del estudio' })).toHaveAttribute('href', `${app}/reservar/${SLUG}`);
  // El widget también lo dice, con el mismo enlace.
  const aviso = page.getByTestId('widget-acceso-cuenta-de-equipo');
  await expect(aviso).toContainText('Esta cuenta es de un equipo de Tentare');
  await expect(aviso.getByRole('link')).toHaveAttribute('href', `${app}/reservar/${SLUG}`);
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toHaveCount(0);

  // Sí entró y sí preguntó (sin contadores, «no llegó» podría ser «no lo intentó»)…
  expect(c.acceso).toHaveLength(1);
  expect(c.cuenta).toHaveLength(1);
  // …y a la web no llegó ninguna sesión. La que se abrió se cerró en gotrue, solo ella.
  expect(c.sesionEnLaWeb).toBe(0);
  expect(c.logout).toHaveLength(1);
  expect(new URL(c.logout[0]).searchParams.get('scope')).toBe('local');
  // Y el widget no guardó nada en la web del estudio.
  expect(await page.evaluate(() => localStorage.getItem('sb-portal-auth') ?? sessionStorage.getItem('sb-portal-auth'))).toBeNull();
  await ventana.close();
});

test('si el servidor no contesta a «¿es de equipo?»: no se entrega nada (fallo cerrado)', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const c = await enLaWebDelEstudio(page, context, app, ANFITRIONA, {
    cuenta: (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) }),
  });
  await page.getByPlaceholder('Email').fill('socia@example.com');
  await page.getByPlaceholder('Contraseña').fill('una-clave-de-pruebas');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const ventana = await ventanaPromesa;
  await ventana.waitForEvent('close', { timeout: 90_000 });

  await expect(page.getByRole('alert')).toHaveText('No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.');
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toHaveCount(0);
  expect(c.cuenta.length).toBeGreaterThan(0);
  expect(c.sesionEnLaWeb).toBe(0);
});

/** Lo que hay guardado en tentare.app (claves de Supabase), leído desde otra pestaña del mismo origen. */
async function guardadoEnTentare(context: BrowserContext, app: string): Promise<Record<string, string | null>> {
  const p = await context.newPage();
  await p.route(`${app}/__e2e-almacen`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
  await p.goto(`${app}/__e2e-almacen`);
  const datos = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('sb-')).map((k) => [k, localStorage.getItem(k)])));
  await p.close();
  return datos;
}

/** La sesión de la propia alumna en tentare.app (el portal), puesta antes de empezar. */
async function conSesionDelPortal(context: BrowserContext, app: string): Promise<string> {
  const valor = JSON.stringify({ access_token: 'la-de-la-alumna', refresh_token: 'refresh-de-la-alumna', expires_at: Math.floor(Date.now() / 1000) + 3600 });
  const p = await context.newPage();
  await p.route(`${app}/__e2e-almacen`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
  await p.goto(`${app}/__e2e-almacen`);
  await p.evaluate((v) => localStorage.setItem('sb-portal-auth', v), valor);
  await p.close();
  return valor;
}

/** El código del correo, escrito en la ventana: `/api/auth/otp/verificar` contesta con una sesión de email. */
async function conCodigoQueAbreSesion(context: BrowserContext, app: string): Promise<{ veces: number }> {
  const contador = { veces: 0 };
  await context.route(`${app}/api/auth/otp/verificar`, (r) => {
    contador.veces++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, session: { access_token: tokenDe('otp'), refresh_token: 'refresh-e2e-codigo' },
    }) });
  });
  return contador;
}

test('con el código del correo: la sesión llega al widget y NO se queda en tentare.app, ni pisa la de la alumna', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const suya = await conSesionDelPortal(context, app);
  const verificar = await conCodigoQueAbreSesion(context, app);
  const c = await enLaWebDelEstudio(page, context, app);
  await page.getByRole('button', { name: 'No tengo contraseña — enviarme un enlace' }).click();
  await page.getByPlaceholder('Email').fill('nueva@example.com');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Enviarme un enlace por email' }).click();
  const ventana = await ventanaPromesa;
  await expect(page.getByText('Te hemos escrito a')).toBeVisible({ timeout: 90_000 });
  await ventana.getByTestId('codigo-correo').fill('123456');

  await ventana.waitForEvent('close', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toBeVisible({ timeout: 15_000 });
  expect(verificar.veces).toBe(1);
  expect(c.cuenta).toHaveLength(1);
  expect(c.sesionEnLaWeb).toBeGreaterThan(0);
  // Un solo dueño: en tentare.app no queda la sesión del puente, y la de la alumna sigue intacta.
  const guardado = await guardadoEnTentare(context, app);
  expect(Object.keys(guardado).filter((k) => k.startsWith('sb-puente-widget'))).toEqual([]);
  expect(guardado['sb-portal-auth']).toBe(suya);
  // Nadie la cerró (cerrarla mataría la del widget) ni la refrescó.
  expect(c.logout).toHaveLength(0);
  expect(c.refresco).toBe(0);
});

test('cuenta de equipo con el código del correo: no llega nada a la web, y el widget lo dice tras «revisa tu correo»', async ({ page, context, baseURL }) => {
  const app = new URL(baseURL!).origin;
  const suya = await conSesionDelPortal(context, app);
  const verificar = await conCodigoQueAbreSesion(context, app);
  const c = await enLaWebDelEstudio(page, context, app, ANFITRIONA, { cuenta: comoEquipo });
  await page.getByRole('button', { name: 'No tengo contraseña — enviarme un enlace' }).click();
  await page.getByPlaceholder('Email').fill('equipo@example.com');
  const ventanaPromesa = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Enviarme un enlace por email' }).click();
  const ventana = await ventanaPromesa;
  await expect(page.getByText('Te hemos escrito a')).toBeVisible({ timeout: 90_000 });
  await ventana.getByTestId('codigo-correo').fill('123456');

  await expect(ventana.getByRole('heading', { name: 'Esta cuenta es de un equipo de Tentare: entra desde tentare.app.' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('widget-acceso-cuenta-de-equipo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mi cuenta' })).toHaveCount(0);
  expect(verificar.veces).toBe(1);
  expect(c.cuenta).toHaveLength(1);
  expect(c.sesionEnLaWeb).toBe(0);
  // La sesión que se abrió en la ventana se cerró (solo ella) y no queda guardada.
  expect(c.logout).toHaveLength(1);
  expect(new URL(c.logout[0]).searchParams.get('scope')).toBe('local');
  const guardado = await guardadoEnTentare(context, app);
  expect(Object.keys(guardado).filter((k) => k.startsWith('sb-puente-widget'))).toEqual([]);
  expect(guardado['sb-portal-auth']).toBe(suya);
  await ventana.close();
});
