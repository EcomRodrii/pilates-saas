import { test, expect, type Page } from '@playwright/test';
import { montarPortal, SLUG, SOCIA } from './portal-mock';

// La verificación en dos pasos en la app de la alumna (4-oct-2026). Opcional:
// solo la sufre quien la activa en su perfil, y a quien no la tiene NO le puede
// costar ni una petición. Cada camino cuenta lo que pide de verdad: un test de
// «no ha pasado nada» sin contador puede ser verde por no haber intentado nada
// (ver e2e/socia-lista.ts).

// ⚠️ Sin service worker, como e2e/student-preguntas-alta.spec.ts: en el build
// de producción (el del CI) la app registra `/sw.js`, y en WebKit una página ya
// controlada por él manda sus `fetch` a través del worker, así que `page.route`
// no los ve y el envío y la comprobación del código llegaban al servidor de
// verdad. En `next dev` no hay worker. No cambia nada de lo que se prueba.
test.use({ serviceWorkers: 'block' });

/** Un JWT sin firmar con el nivel que se pida: supabase-js lo lee sin red. */
function tokenFalso(aal: 'aal1' | 'aal2'): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: 'auth-marta', aud: 'authenticated', role: 'authenticated', aal,
    session_id: '11111111-1111-4111-8111-111111111111', exp: 4102444800,
  })}.c2lnbmF0dXJh`;
}

const FACTOR = { id: 'fac-1', factor_type: 'totp', status: 'verified', friendly_name: 'Estudio', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

/**
 * Sesión de la app con la verificación ACTIVADA y aún sin pasar. `enElMovil`:
 * si la sesión guardada lo sabe; `false` = la activó en otro dispositivo y solo
 * lo sabe el servidor (`/auth/v1/user`).
 */
async function sesionConVerificacion(page: Page, enElMovil = true, factor: typeof FACTOR = FACTOR) {
  // Otro origen con Authorization: WebKit hace preflight y exige las cabeceras
  // CORS (Chromium lo deja pasar sin ellas). Sin esto, en WebKit la lectura fallaba.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
  await page.route('**/auth/v1/user', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({
      status: 200, contentType: 'application/json', headers: cors,
      body: JSON.stringify({ id: 'auth-marta', email: SOCIA.email, aud: 'authenticated', role: 'authenticated', factors: [factor] }),
    }));
  await page.addInitScript(([token, email, factores]) => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: token, refresh_token: 'e2e-refresh', token_type: 'bearer',
      expires_at: 4102444800, expires_in: 999999999,
      user: {
        id: 'auth-marta', email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
        factors: factores,
      },
    }));
  }, [tokenFalso('aal1'), SOCIA.email, enElMovil ? [factor] : []] as const);
}

/** Cuenta cada petición del segundo paso. `confiada` = lo que contesta el dispositivo recordado. */
async function contarSegundoPaso(page: Page, opciones: { confiadaTrasVerificar?: boolean; codigoBueno?: string } = {}) {
  const n = { usar: 0, enviar: 0, verificar: 0 };
  let verificada = false;
  await page.route('**/api/auth/dispositivo-confianza/usar', (r) => {
    n.usar++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ confiada: verificada && opciones.confiadaTrasVerificar !== false, nueva: false }) });
  });
  await page.route('**/api/auth/doble-factor-correo/enviar', (r) => {
    n.enviar++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enviado: true }) });
  });
  await page.route('**/api/auth/doble-factor-correo/verificar', async (r) => {
    n.verificar++;
    const { codigo } = JSON.parse(r.request().postData() ?? '{}') as { codigo?: string };
    if (codigo === (opciones.codigoBueno ?? '123456')) {
      verificada = true;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'El código no es correcto. Te quedan 4 intentos.' }) });
  });
  return n;
}

test('sin la verificación activada: la app entra como siempre y no pide nada del segundo paso', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  const n = await contarSegundoPaso(page);
  let sesionPedida = 0;
  page.on('request', (req) => { if (req.url().includes('/api/public/session')) sesionPedida++; });

  await page.goto(`/portal/${SLUG}`);
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/?$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  // Andamiaje vivo: la app ha llegado a preguntar por la sesión…
  await expect.poll(() => sesionPedida).toBeGreaterThan(0);
  // …y del segundo paso, ni una petición.
  expect(n).toEqual({ usar: 0, enviar: 0, verificar: 0 });
});

test('con la verificación activada: código al correo, se escribe y vuelve a donde iba', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await sesionConVerificacion(page);
  const n = await contarSegundoPaso(page);

  await page.goto(`/portal/${SLUG}/perfil`);
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso/dos-pasos\\?next=`), { timeout: 30_000 });
  // El dispositivo no estaba recordado: se preguntó, y el correo salió solo.
  await expect(page.getByText(/Te hemos enviado un código de 6 dígitos/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => n.usar).toBeGreaterThan(0);
  await expect.poll(() => n.enviar).toBe(1);

  await page.getByLabel('Código de 6 dígitos').fill('123456');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/perfil$`), { timeout: 30_000 });
  expect(n.verificar).toBe(1);
  // Al recargar no se vuelve a mandar ningún correo: la sesión ya cuenta como verificada.
  expect(n.enviar).toBe(1);
});

test('un código equivocado: lo dice el servidor, se queda en la pantalla y no deja entrar', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await sesionConVerificacion(page);
  const n = await contarSegundoPaso(page);

  await page.goto(`/portal/${SLUG}/acceso/dos-pasos?next=/portal/${SLUG}/perfil`);
  await expect(page.getByText(/Te hemos enviado un código/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByText('El código no es correcto. Te quedan 4 intentos.')).toBeVisible();
  expect(n.verificar).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/acceso\/dos-pasos/);
});

test('«No tengo acceso a mi correo» pasa a la app de códigos sin mandar otro correo', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await sesionConVerificacion(page);
  const n = await contarSegundoPaso(page);

  await page.goto(`/portal/${SLUG}/acceso/dos-pasos`);
  await expect(page.getByText(/Te hemos enviado un código/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'No tengo acceso a mi correo' }).click();
  await expect(page.getByText(/Abre tu app de autenticación/)).toBeVisible();
  await expect(page.getByText(/puede quitarte la verificación/)).toBeVisible();
  await expect.poll(() => n.enviar).toBe(1);
});

test('si el servidor dice que falta el paso aunque el móvil crea que no, la app manda a verificar', async ({ page }) => {
  // Sesión sin factor en el dispositivo (p. ej. la activó en otro móvil): solo el
  // servidor lo sabe, y contesta `doble_factor_requerido` en vez de un 401 a secas.
  await montarPortal(page, { conSesion: true });
  await sesionConVerificacion(page, false);
  let respuestas = 0;
  await page.route('**/api/public/session**', (r) => {
    respuestas++;
    return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Falta el segundo paso', codigo: 'doble_factor_requerido' }) });
  });
  const n = await contarSegundoPaso(page);

  await page.goto(`/portal/${SLUG}/perfil`);
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso/dos-pasos`), { timeout: 30_000 });
  expect(respuestas).toBeGreaterThan(0);
  // Y se queda pidiendo el código (con los factores del servidor), sin rebotar a la app.
  await expect(page.getByText(/Te hemos enviado un código/)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => n.enviar).toBe(1);
});

test('con solo el factor de la zona interna de Tentare, la app no pide el código', async ({ page }) => {
  // 5-oct-2026: el factor que /interno obliga a crear ('Tentare Internal') solo
  // cuenta allí. Antes encendía el código también en la app del estudio.
  await montarPortal(page, { conSesion: true });
  await sesionConVerificacion(page, true, { ...FACTOR, friendly_name: 'Tentare Internal' });
  const n = await contarSegundoPaso(page);
  let sesionPedida = 0;
  page.on('request', (req) => { if (req.url().includes('/api/public/session')) sesionPedida++; });

  await page.goto(`/portal/${SLUG}/perfil`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => sesionPedida).toBeGreaterThan(0);
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/perfil$`));
  expect(n).toEqual({ usar: 0, enviar: 0, verificar: 0 });
});
