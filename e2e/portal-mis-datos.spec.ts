import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// «Mis datos» — que no le borre el perfil a nadie. Verificado sobre
// `PortalPerfilView` (`components/portal/portal-perfil-view.tsx`), la vista
// del portal de siempre — no la del kit, que es donde se escribió esto
// originalmente con `kit: 'sereno'` de atajo.
//
// ⚠️ El bug que vigila el primer test podía DESTRUIR datos de una socia. En el
// portal de siempre la protección es incluso más tajante que en el kit: si no
// hay `socio` cargado, `PortalPerfilView` devuelve `null` sin más
// (`if (!socio || !session) return null;`, línea de la propia vista) — no hay
// NINGÚN formulario, ni un botón "Guardar" apagado con una explicación: no se
// pinta nada en absoluto. No puede pisar datos reales un formulario que no
// existe.
//
// `sinSocia` reproduce lo que devuelve el servidor cuando el token de la
// socia ya no vale y el navegador todavía cree que hay sesión — catálogo
// completo, socia ausente. La app se monta entera y el perfil no pinta nada.
//
// El tercer test migra la validación de email del kit (que rechazaba en el
// CLIENTE antes de mandar nada) a lo que el portal de siempre hace de
// verdad: no valida en el cliente, manda siempre al servidor y confía en su
// respuesta — el comentario de `updateSocio` en lib/studio-context.tsx lo
// documenta explícitamente: antes era fire-and-forget y un 400 no llegaba a
// nadie, la socia leía «Datos guardados» sin que se hubiera guardado nada.
// Se preserva esa mitad real: un rechazo del servidor se ve, y la hoja no se
// cierra como si hubiera ido bien. Ahora se prueba sobre "Nombre" en vez de
// "Email", porque el email ya no vive en este formulario (ver más abajo).
//
// La validación de teléfono internacional del test original ("el teléfono de
// fuera de España se acepta") no tiene equivalente aquí: el portal de siempre
// nunca tuvo ninguna validación de formato de teléfono que regredir — se
// omite en vez de fabricar una comprobación que no existe.
//
// ⚠️ El Email SALIÓ de "Mis datos". Antes este formulario escribía
// `socios.email` directo vía `updateSocio()` — el mismo campo que
// `fetchPublicStudioData` compara contra el email del JWT como prueba de
// identidad (lib/db/supabase-data-admin.ts). Un typo ahí bloqueaba a la
// socia de sus propios datos, sin verificar nunca que la controlara de
// verdad (ver memoria del repo sobre socia.dev). Mismo fix que ya se hizo en
// PortalAjustesView: el email de acceso ahora se cambia desde una hoja
// separada, "Cambiar email", que pasa por `actualizarEmail()`
// (auth.updateUser) y nunca toca `socios.email` directamente — sus propios
// tests viven en el describe de abajo.
// ─────────────────────────────────────────────────────────────────────────────

async function abrirMisDatos(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Mis datos' }).click({ timeout: 30_000 });
}

async function abrirCambiarEmail(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Cambiar email' }).click({ timeout: 30_000 });
}

test.setTimeout(180_000);

test.describe('Mis datos', () => {
  test('sin socia cargada, no hay ningún formulario que pueda pisar sus datos', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinSocia: true });
    await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    // El armazón sigue montado (la barra de navegación aparece en cuanto los
    // datos han cargado) — lo que falta es el contenido de Perfil.
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Mis datos' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cambiar email' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /guardar/i })).toHaveCount(0);
  });

  test('con datos cargados el formulario los trae, sin el email', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirMisDatos(page);

    await expect(page.getByLabel('Nombre')).toHaveValue('Marta', { timeout: 30_000 });
    // El email ya no es un campo de este formulario — vive en "Cambiar email".
    await expect(page.getByLabel('Email')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  test('si el servidor rechaza el guardado, no se dice que se ha guardado', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirMisDatos(page);
    await expect(page.getByLabel('Nombre')).toHaveValue('Marta', { timeout: 30_000 });

    await page.route('**/api/public/socio', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"No se ha podido guardar tus datos."}' }));

    await page.getByLabel('Nombre').fill('Marta Editada');
    await page.getByRole('button', { name: 'Guardar' }).click();

    // ⚠️ Antes esto era fire-and-forget: la socia leía «Datos guardados» pasara
    // lo que pasara con el servidor.
    await expect(page.getByText('No se ha podido guardar tus datos.')).toBeVisible({ timeout: 15_000 });
    // Sigue en la hoja: si hubiera guardado, `guardarDatos` la habría cerrado.
    await expect(page.getByLabel('Nombre')).toBeVisible();
  });
});

test.describe('Cambiar email', () => {
  test('la fila enseña el email actual y no está dentro de "Mis datos"', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    await expect(page.getByRole('button', { name: /Cambiar email/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('marta@example.com')).toBeVisible();
  });

  test('con email nuevo escrito, pide el enlace y no dice "actualizado" sin más', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirCambiarEmail(page);

    await expect(page.getByLabel('Nuevo email')).toBeVisible({ timeout: 30_000 });
    // Sin nada escrito, no se puede enviar — mismo criterio que el resto del portal.
    await expect(page.getByRole('button', { name: 'Enviarme el enlace' })).toBeDisabled();

    await page.getByLabel('Nuevo email').fill('marta.nueva@example.com');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();

    // El mock genérico de `**/auth/v1/**` (portal-mock.ts) devuelve `{}`, así
    // que `data.user?.email` nunca coincide con el nuevo email: pendiente=true,
    // que es el caso real (Supabase exige confirmar el enlace antes de aplicar
    // el cambio). Decir "actualizado" aquí sin que la socia haya abierto nada
    // sería el mismo tipo de mentira que ya se corrigió en "Mis datos".
    await expect(page.getByText('Te hemos mandado un enlace de confirmación al email nuevo. El cambio se aplica cuando lo abras.'))
      .toBeVisible({ timeout: 15_000 });
  });

  test('si el servidor rechaza el cambio, no se dice que se ha enviado ningún enlace', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirCambiarEmail(page);
    await expect(page.getByLabel('Nuevo email')).toBeVisible({ timeout: 30_000 });

    // `actualizarEmail` (lib/portal-auth.tsx) llama a
    // `supabasePortal.auth.updateUser({ email })`, que en el cliente de
    // Supabase golpea PUT `auth/v1/user`. Mismo formato de error de GoTrue que
    // ya usan otros e2e de auth (p. ej. e2e/acceso-sin-callejones.spec.ts).
    await page.route('**/auth/v1/user**', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 400, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }),
      }));

    await page.getByLabel('Nuevo email').fill('ya-registrado@example.com');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();

    // No es jerga técnica (sin regex de HUELLAS_TECNICAS que la descarte, ver
    // lib/errores.ts), así que `mensajeSeguro` la deja pasar tal cual.
    await expect(page.getByText('A user with this email address has already been registered')).toBeVisible({ timeout: 15_000 });
    // Sigue en la hoja, sin el aviso de "enlace enviado".
    await expect(page.getByLabel('Nuevo email')).toBeVisible();
    await expect(page.getByText('Te hemos mandado un enlace de confirmación')).toHaveCount(0);
  });
});
