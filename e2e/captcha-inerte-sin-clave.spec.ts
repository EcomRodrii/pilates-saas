import { test, expect, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El widget de Turnstile (login de equipo + alta de estudio) solo se pinta y
// solo bloquea el envío si hay NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada. El
// entorno de e2e (igual que local/preview sin la env var real) NO la tiene —
// este test fija que, sin clave, el botón de enviar sigue habilitado y el
// formulario se puede enviar con normalidad, tal y como funcionaba antes de
// añadir el captcha.
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('login: sin clave de Turnstile, el botón de entrar no se queda deshabilitado', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => json(route, { message: 'Invalid login credentials' }, 400));

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('nadie@example.com');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('lo-que-sea');

  const submit = page.getByRole('button', { name: 'Entrar' });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
});

test('crear-estudio: sin clave de Turnstile, el alta llega hasta el backend', async ({ page }) => {
  // Contador de peticiones, no solo «no salió error»: el alta tiene tres pasos
  // y una validación por paso, así que un test que solo mirase que no aparece
  // un mensaje rojo pasaría igual si el botón nunca hubiera llegado a enviar
  // nada. Ver .claude/tentare-os.md — un camino sin contador es hueco.
  let altasPedidas = 0;
  await page.route('**/auth/v1/signup**', route => {
    altasPedidas += 1;
    // Sin sesión y con `identities` no vacío = alta creada, falta confirmar el
    // email. Es el camino real de este proyecto.
    return json(route, { user: { id: 'u1', email: 'ana@example.com', identities: [{ id: 'i1' }] }, session: null });
  });

  await page.goto('/crear-estudio');

  await page.getByRole('textbox', { name: 'Nombre de tu estudio' }).fill('Estudio Ana');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 2: el plan ya viene elegido por defecto, así que solo hay que seguir.
  await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  await page.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana');
  await page.getByRole('textbox', { name: 'Email' }).fill('ana@example.com');
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('contrasena-larga');

  const submit = page.getByRole('button', { name: /días gratis/ });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect.poll(() => altasPedidas).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();
});
