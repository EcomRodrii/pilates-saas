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
// cierra como si hubiera ido bien.
//
// La validación de teléfono internacional del test original ("el teléfono de
// fuera de España se acepta") no tiene equivalente aquí: el portal de siempre
// nunca tuvo ninguna validación de formato de teléfono que regredir — se
// omite en vez de fabricar una comprobación que no existe.
// ─────────────────────────────────────────────────────────────────────────────

async function abrirMisDatos(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Mis datos' }).click({ timeout: 30_000 });
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
    await expect(page.getByRole('button', { name: /guardar/i })).toHaveCount(0);
  });

  test('con datos cargados el formulario los trae', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirMisDatos(page);

    await expect(page.getByLabel('Nombre')).toHaveValue('Marta', { timeout: 30_000 });
    await expect(page.getByLabel('Email')).toHaveValue('marta@example.com');
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  test('si el servidor rechaza el guardado, no se dice que se ha guardado', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await abrirMisDatos(page);
    await expect(page.getByLabel('Email')).toHaveValue('marta@example.com', { timeout: 30_000 });

    await page.route('**/api/public/socio', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Ese email no es válido."}' }));

    await page.getByLabel('Email').fill('marta@gmail');
    await page.getByRole('button', { name: 'Guardar' }).click();

    // ⚠️ Antes esto era fire-and-forget: la socia leía «Datos guardados» pasara
    // lo que pasara con el servidor.
    await expect(page.getByText('Ese email no es válido.')).toBeVisible({ timeout: 15_000 });
    // Sigue en la hoja: si hubiera guardado, `guardarDatos` la habría cerrado.
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
