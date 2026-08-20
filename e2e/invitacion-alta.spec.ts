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
//
// Detectado en producción tras esto: una propietaria invitó a alguien como
// PROPIETARIO, el alta y el código OTP fueron perfectos, pero la cuenta acabó
// sin vincular a ningún estudio — sessionStorage se había perdido en el salto
// de /invitacion a /login sin dejar traza de la causa exacta (partición de
// almacenamiento del navegador, un cliente de correo reescribiendo el
// enlace...). El token ahora viaja TAMBIÉN por la URL (`&token=`), y /login
// lo vuelve a guardar en sessionStorage al montar — una segunda vía que no
// depende de que ese storage sobreviva el salto.
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
    // Y el botón de continuar llevó el token también en la URL de destino —
    // la segunda vía, no solo sessionStorage.
    await expect(page).toHaveURL(new RegExp(`token=${encodeURIComponent(TOKEN)}`));
    // Y el formulario que se ve es el de CREAR, no el de entrar.
    await expect(page.getByRole('heading', { name: 'Crear cuenta de equipo' })).toBeVisible();
  });

  test('regresión: si sessionStorage se pierde en el salto, la URL rescata el token igual', async ({ page }) => {
    // Reproduce el caso real: nunca se pasa por /invitacion en esta pestaña
    // (o su sessionStorage no sobrevivió), así que se llega a /login SOLO con
    // el token en la URL — exactamente como lo deja /invitacion ahora.
    await page.route('**/api/**', route => json(route, {}));
    await page.goto(`/login?destino=/dashboard&alta=1&token=${encodeURIComponent(TOKEN)}`);

    await expect(page.getByRole('heading', { name: 'Crear cuenta de equipo' })).toBeVisible({ timeout: 30_000 });
    // La URL, no sessionStorage, es la única fuente aquí — y aun así queda
    // guardado, listo para viajar en la metadata del alta.
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invitacion'))).toBe(TOKEN);
  });

  test('sin ?alta=1 el login sigue abriendo en "iniciar sesión"', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: 30_000 });
  });
});
