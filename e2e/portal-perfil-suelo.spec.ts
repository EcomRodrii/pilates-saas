import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El SUELO del perfil: lo mismo para toda socia, tenga su estudio el tema que
// tenga.
//
// ⚠️ Los tres «perfiles» del kit no eran variantes de estilo: eran TRES
// PANTALLAS DISTINTAS con opciones distintas. Con Oliva/Bloom/Noir la socia NO
// podía llegar a sus datos, ni a su método de pago, ni cerrar sesión — y
// encima veía una tabla de «Historial» con clases ESCRITAS A MANO en el JSX,
// como si fueran suyas.
//
// Esto fija el suelo. La FORMA sigue siendo de cada tema; el contenido, no.
// ─────────────────────────────────────────────────────────────────────────────

const SUELO = ['Datos personales', 'Mis bonos', 'Historial de clases', 'Favoritas', 'Método de pago'];

for (const tema of ['oliva', 'bloom', 'noir', 'sereno', 'tentada']) {
  test(`${tema}: toda socia llega a su cuenta y puede salir`, async ({ page }) => {
    await page.goto(`/portal-tema-preview/${tema}`);
    await page.locator('.welcome__cta').click();
    // Por NOMBRE ACCESIBLE, no por texto visible: las barras flotantes que
    // solo escriben la pestaña activa (Bloom) no tienen texto en las otras.
    await page.getByRole('button', { name: 'Perfil', exact: true }).click();

    for (const label of SUELO) {
      // Tentada rotula «Métodos de pago» en plural en su propia fila; se acepta
      // el prefijo para no atar el test a la palabra exacta de cada tema.
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first())
        .toBeVisible({ timeout: 30_000 });
    }
    // ⚠️ Sin esto, una socia que entra desde un móvil prestado no tiene salida.
    await expect(page.getByRole('button', { name: /Cerrar sesión/i })).toBeVisible();
  });
}

test('ya no hay historial inventado en el perfil', async ({ page }) => {
  // ⚠️ «Reformer fuerza · Vie 29 · No asistida» estaba escrito en el JSX y lo
  // veía cada socia de un estudio con este tema. Es el §25 del encargo: nada de
  // mocks como solución.
  await page.goto('/portal-tema-preview/oliva');
  await page.locator('.welcome__cta').click();
  // Por NOMBRE ACCESIBLE, no por texto visible: las barras flotantes que
    // solo escriben la pestaña activa (Bloom) no tienen texto en las otras.
    await page.getByRole('button', { name: 'Perfil', exact: true }).click();
  await expect(page.getByText('Reformer fuerza')).toHaveCount(0);
  await expect(page.getByText('No asistida')).toHaveCount(0);
});
