import { test, expect, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El otro lado de la invitación: el de la persona invitada.
//
// El enlace del correo lleva un token firmado que identifica su ficha, y ese
// token tiene que sobrevivir hasta DESPUÉS del alta — es lo único que permite
// vincularla si se registra con un correo distinto al que la dueña le puso.
// Antes se perdía al salir de /invitacion, y la cuenta quedaba suelta, sin
// estudio: le pasó a Rosi y a María Soler y hubo que enlazarlas a mano.
//
// Y al llegar a /login aterrizaba en "Iniciar sesión" — un formulario para
// entrar con una cuenta que todavía no existe. El `?alta=1` viajaba desde el
// principio; simplemente nadie lo leía.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = 'payload-de-prueba.firma-de-prueba';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Invitación: alta de la persona invitada', () => {
  test('el token sobrevive al salto de /invitacion a /login, y llega en modo alta', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/api/public/invitacion**', route => json(route, {
      yaVinculada: false, nombre: 'Marta', email: 'marta@example.com', estudio: 'Studio Carmen',
    }));

    await page.goto(`/invitacion?token=${encodeURIComponent(TOKEN)}`);
    await expect(page.getByText(/te han dado de alta en Studio Carmen/i)).toBeVisible({ timeout: 30_000 });

    // Guardado ANTES de irse: en el siguiente paso ya no hay query string.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBe(TOKEN);

    await page.getByRole('button', { name: 'Crear mi cuenta' }).click();

    await expect(page).toHaveURL(/\/login\?/, { timeout: 30_000 });
    // Sigue ahí tras el salto de página, listo para viajar en la metadata del alta.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBe(TOKEN);
    // Y el formulario que se ve es el de CREAR, no el de entrar.
    await expect(page.getByRole('heading', { name: 'Crear cuenta de equipo' })).toBeVisible();
  });

  test('sin ?alta=1 el login sigue abriendo en "iniciar sesión"', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: 30_000 });
  });
});
