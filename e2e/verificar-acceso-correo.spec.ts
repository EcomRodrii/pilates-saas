// El segundo paso por correo en /verificar-acceso (lib/auth/codigo-correo-reglas.ts):
// por defecto se manda un código al correo; la app queda para «No tengo acceso
// a mi correo», para cuando el servidor dice que el correo no vale en esta
// sesión, y para `?codigo=1` (lo que exige el código de la app de verdad).
//
// Todo mockeado con page.route: la sesión es `aal1` con un factor TOTP
// verificado, como tras entrar solo con la contraseña.
import { test, expect, type Page, type Route } from '@playwright/test';

const STORAGE_KEY = 'sb-example-auth-token';
const UID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'equipo@example.com';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Un JWT con forma (la firma da igual: todo va mockeado, pero supabase-js exige
// que cada trozo sea base64url válido: longitud múltiplo de 4 salvo 2 o 3 de resto).
// `aal1`, entró con contraseña.
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
  sub: UID, aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }], session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  exp: 4102444800, role: 'authenticated', email: EMAIL,
})}.ZmlybWFkbw`;
const USUARIO = {
  id: UID, email: EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  factors: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'Tentare', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
};

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

interface Peticiones { enviar: { reenviar?: boolean }[]; verificar: { codigo?: string; recordar?: boolean }[] }

async function montar(page: Page, opciones: { enviar?: unknown; verificar?: { cuerpo: unknown; estado: number } } = {}): Promise<Peticiones> {
  const p: Peticiones = { enviar: [], verificar: [] };
  await page.route('**/rest/v1/**', (r) => json(r, null));
  await page.route('**/auth/v1/**', (r) => json(r, USUARIO));
  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/api/auth/doble-factor', (r) => json(r, { paso: 'verificar', factores: 1, estudioLoExige: false, rol: 'PROPIETARIO' }));
  await page.route('**/api/auth/dispositivo-confianza/usar', (r) => json(r, { confiada: false, nueva: false }));
  await page.route('**/api/auth/doble-factor-correo/enviar', (r) => {
    p.enviar.push(r.request().postDataJSON() ?? {});
    return json(r, opciones.enviar ?? { enviado: true });
  });
  await page.route('**/api/auth/doble-factor-correo/verificar', (r) => {
    p.verificar.push(r.request().postDataJSON() ?? {});
    const v = opciones.verificar ?? { cuerpo: { ok: true }, estado: 200 };
    return json(r, v.cuerpo, v.estado);
  });
  // A dónde vuelve tras verificar: basta con que la navegación llegue.
  await page.route('**/dashboard', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>panel</p>' }));
  await page.addInitScript(([k, token, user]) => {
    localStorage.setItem(k as string, JSON.stringify({
      access_token: token, refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer', user,
    }));
  }, [STORAGE_KEY, TOKEN, USUARIO] as const);
  return p;
}

test('por defecto el código va al correo de la cuenta, y con el bueno se entra', async ({ page }) => {
  const p = await montar(page);
  await page.goto('/verificar-acceso');
  await expect(page.getByText(/Te hemos enviado un código de 6 dígitos/)).toBeVisible();
  await expect(page.getByText(EMAIL).first()).toBeVisible();
  expect(p.enviar).toEqual([{ reenviar: false }]);
  await expect(page.getByRole('button', { name: /Reenviar en \d+ s/ })).toBeDisabled();

  await page.getByLabel('Código de 6 dígitos').fill('048213');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.waitForURL('**/dashboard');
  // «No volver a pedirlo en este dispositivo» viene MARCADO (5-oct-2026).
  expect(p.verificar).toEqual([expect.objectContaining({ codigo: '048213', recordar: true })]);
});

test('quien desmarca «No volver a pedirlo» no deja el dispositivo recordado', async ({ page }) => {
  const p = await montar(page);
  await page.goto('/verificar-acceso');
  await expect(page.getByText(/Te hemos enviado un código de 6 dígitos/)).toBeVisible();
  await page.getByLabel('No volver a pedir el código en este dispositivo').uncheck();
  await page.getByLabel('Código de 6 dígitos').fill('048213');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.waitForURL('**/dashboard');
  expect(p.verificar).toEqual([expect.objectContaining({ codigo: '048213', recordar: false })]);
});

test('si el servidor dice que el código no vale, no entra y lo dice', async ({ page }) => {
  const p = await montar(page, { verificar: { estado: 400, cuerpo: { ok: false, motivo: 'incorrecto', error: 'Código incorrecto. Revisa el último correo que te hemos enviado.' } } });
  await page.goto('/verificar-acceso');
  await page.getByLabel('Código de 6 dígitos').fill('111111');
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Código incorrecto/ })).toBeVisible();
  expect(p.verificar.length).toBeGreaterThan(0);
  await expect(page).toHaveURL(/verificar-acceso/);
});

test('si el correo no vale en esta sesión, pasa a la app diciendo por qué', async ({ page }) => {
  const p = await montar(page, { enviar: { disponible: false, motivo: 'sin_contrasena', mensaje: 'Has entrado sin contraseña, así que el código no puede ir a tu correo. Usa tu app de autenticación.' } });
  await page.goto('/verificar-acceso');
  await expect(page.getByText(/Has entrado sin contraseña/)).toBeVisible();
  await expect(page.getByText(/Abre tu app de autenticación/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefiero recibirlo por correo' })).toHaveCount(0);
  expect(p.enviar.length).toBe(1);
});

test('«No tengo acceso a mi correo» lleva a la app, y se puede volver', async ({ page }) => {
  await montar(page);
  await page.goto('/verificar-acceso');
  await page.getByRole('button', { name: 'No tengo acceso a mi correo' }).click();
  await expect(page.getByText(/Abre tu app de autenticación/)).toBeVisible();
  await page.getByRole('button', { name: 'Prefiero recibirlo por correo' }).click();
  await expect(page.getByText(/Te hemos enviado un código/)).toBeVisible();
});

test('?codigo=1 (quitar la verificación, cambiar el correo) va directo a la app y no manda correo', async ({ page }) => {
  const p = await montar(page);
  await page.goto('/verificar-acceso?codigo=1&volver=/mi-perfil');
  await expect(page.getByText(/Abre tu app de autenticación/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefiero recibirlo por correo' })).toHaveCount(0);
  expect(p.enviar).toEqual([]);
});
