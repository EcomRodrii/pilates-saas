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

test('crear-estudio: sin clave de Turnstile, el formulario de interés llega hasta el backend', async ({ page }) => {
  let interesLlamado = false;
  await page.route('**/api/public/interes-lanzamiento', route => {
    interesLlamado = true;
    return json(route, { ok: true });
  });

  await page.goto('/crear-estudio');
  await page.getByRole('textbox', { name: 'Email' }).fill('ana@example.com');

  const submit = page.getByRole('button', { name: /Avísame cuando esté activo/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => interesLlamado).toBe(true);
});
