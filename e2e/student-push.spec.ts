import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, sembrarSociaLista } from './socia-lista';

// Avisos push en ESTE dispositivo (Preferencias).
//
// Lo que rompe a una alumna: un interruptor que dice «activado» sin que el
// servidor tenga la suscripción, o una tarjeta que no aparece porque el
// navegador está en un estado que la pantalla no contempla (iPhone sin
// instalar, permiso bloqueado).
//
// El Chromium de Playwright no tiene servicio de push real, y `public/sw.js`
// tiene handler `fetch` + `clients.claim()`: si se registrara de verdad, las
// peticiones dejarían de pasar por `page.route`. Por eso PushManager, el
// registro del SW y el permiso se fingen en la FRONTERA del navegador y se
// comprueba todo lo que hay de nuestro lado: estado pintado, qué se manda al
// servidor y cómo reacciona la pantalla a la respuesta.

const base = `/portal/${SLUG}`;
const PREFS = `${base}/perfil/preferencias`;

type Permiso = 'default' | 'denied' | 'granted';

/** Finge el navegador: permiso, si concede al pedirlo, y si ya hay suscripción. */
async function fingirNavegador(page: Page, permiso: Permiso, opts: { concede?: boolean; suscrita?: boolean } = {}) {
  await page.addInitScript(({ permiso, concede, suscrita }) => {
    type Sub = { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> };
    let sub: Sub | null = null;
    const fake = (nombre: string): Sub => {
      const s: Sub = {
        endpoint: `https://push.e2e.test/${nombre}`,
        toJSON: () => ({ endpoint: s.endpoint, keys: { p256dh: 'p256dh-e2e', auth: 'auth-e2e' } }),
        unsubscribe: async () => { sub = null; return true; },
      };
      return s;
    };
    if (suscrita) sub = fake('inicial');
    const reg = {
      active: {},
      scope: `${location.origin}/portal/tentare/`,
      pushManager: {
        getSubscription: async () => sub,
        subscribe: async () => { sub = fake('nueva'); return sub; },
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) },
    });
    const w = window as unknown as Record<string, unknown>;
    if (!('PushManager' in window)) w.PushManager = function PushManager() { /* finge */ };
    const N = {
      permission: permiso as string,
      requestPermission: async () => { N.permission = concede ? 'granted' : 'denied'; return N.permission; },
    };
    Object.defineProperty(window, 'Notification', { configurable: true, value: N });
  }, { permiso, concede: opts.concede ?? true, suscrita: opts.suscrita ?? false });
}

interface Peticion { method: string; auth: string | undefined; body: Record<string, unknown> }

/** Mocks de lectura de la pantalla + captura de lo que va a /subscribe. */
async function montarPreferencias(page: Page, respuestaSubscribe = 200) {
  await sembrarSociaLista(page);
  const peticiones: Peticion[] = [];
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/notifications/preferences', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? { prefs: {} } : { ok: true }) }));
  await page.route('**/api/notifications/subscribe', (r) => {
    const req = r.request();
    peticiones.push({ method: req.method(), auth: req.headers()['authorization'], body: req.postDataJSON() as Record<string, unknown> });
    return r.fulfill({ status: respuestaSubscribe, contentType: 'application/json', body: JSON.stringify(respuestaSubscribe === 200 ? { ok: true } : { error: 'boom' }) });
  });
  return peticiones;
}

const tarjeta = (page: Page) => page.getByTestId('push-dispositivo');
const interruptor = (page: Page) => tarjeta(page).getByRole('switch');

test.describe('Student PWA · avisos push en este dispositivo', () => {
  test('sin decidir → ofrece activar; al activar manda la suscripción al servidor y pinta activado', async ({ page }) => {
    await fingirNavegador(page, 'default');
    const peticiones = await montarPreferencias(page);
    await page.goto(PREFS);

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'default', { timeout: 30_000 });
    await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
    await interruptor(page).click();

    await expect.poll(() => peticiones.length).toBe(1);
    const [p] = peticiones;
    expect(p.method).toBe('POST');
    // El endpoint valida el JWT: sin cabecera todo dispositivo se registraría anónimo → 401.
    expect(p.auth).toMatch(/^Bearer /);
    // Y el estudio no lo decide el cliente a la ligera: es el de la sesión.
    expect(p.body.studioId).toBe(STUDIO_ID);
    const sub = p.body.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
    expect(sub.endpoint).toBe('https://push.e2e.test/nueva');
    expect(sub.keys.p256dh).toBeTruthy();
    expect(sub.keys.auth).toBeTruthy();

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'granted-on');
    await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('si el servidor NO guarda la suscripción, la pantalla no dice «activado»', async ({ page }) => {
    // Es la mentira que no queremos: el navegador suscrito, la tabla vacía, y
    // la alumna convencida de que le van a avisar.
    await fingirNavegador(page, 'default');
    await montarPreferencias(page, 500);
    await page.goto(PREFS);

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'default', { timeout: 30_000 });
    await interruptor(page).click();

    await expect(page.getByText(/no hemos podido activar los avisos/i)).toBeVisible();
    // Permiso concedido pero sin suscripción: se deshizo la del navegador.
    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'granted-off');
    await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('ya suscrita → desactivar borra en el servidor POR ENDPOINT y apaga', async ({ page }) => {
    await fingirNavegador(page, 'granted', { suscrita: true });
    const peticiones = await montarPreferencias(page);
    await page.goto(PREFS);

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'granted-on', { timeout: 30_000 });
    await interruptor(page).click();

    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0].method).toBe('DELETE');
    expect(peticiones[0].body.endpoint).toBe('https://push.e2e.test/inicial');
    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'granted-off');
  });

  test('permiso rechazado al pedirlo → sigue apagado y no se manda nada', async ({ page }) => {
    await fingirNavegador(page, 'default', { concede: false });
    const peticiones = await montarPreferencias(page);
    await page.goto(PREFS);

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'default', { timeout: 30_000 });
    await interruptor(page).click();

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'denied');
    await expect(interruptor(page)).toHaveCount(0);
    expect(peticiones).toHaveLength(0);
  });

  test('permiso bloqueado → sin interruptor, y dice dónde arreglarlo', async ({ page }) => {
    await fingirNavegador(page, 'denied');
    await montarPreferencias(page);
    await page.goto(PREFS);

    await expect(tarjeta(page)).toHaveAttribute('data-estado', 'denied', { timeout: 30_000 });
    await expect(interruptor(page)).toHaveCount(0);
    await expect(tarjeta(page).getByText(/ajustes del navegador/i)).toBeVisible();
  });

  test.describe('iPhone en Safari, sin añadir a inicio', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });

    test('pide instalar la app en vez de decir que el navegador no admite avisos', async ({ page }) => {
      // Safari iOS sin PWA no expone PushManager: sin esta rama la alumna
      // leería «tu navegador no admite avisos» pudiendo arreglarlo en dos toques.
      await fingirNavegador(page, 'default');
      await montarPreferencias(page);
      await page.goto(PREFS);

      await expect(tarjeta(page)).toHaveAttribute('data-estado', 'ios-sin-instalar', { timeout: 30_000 });
      await expect(interruptor(page)).toHaveCount(0);
      await expect(tarjeta(page).getByText(/Añadir a pantalla de inicio/)).toBeVisible();
    });
  });
});
