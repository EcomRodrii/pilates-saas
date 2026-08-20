import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// De toda pantalla se puede volver.
//
// ⚠️ CALLEJÓN SIN SALIDA en toda la app, y lo encontró el fundador usándola.
//
// `back()` hace `ir({ screen: tab })`. Favoritas e Historial NO tienen ruta
// propia: se abren desde Inicio, así que su destino al volver (`/home`) YA era
// la URL actual. `navegar` no navegaba —correcto, apilaría historial idéntico—
// pero devolvía `true`, y `ir()` solo aplica la pantalla al store cuando le
// dicen que NO se ha navegado. Resultado: la flecha no hacía nada y la socia se
// quedaba encerrada.
//
// Yo tenía la hipótesis en la fase 2 y monté mal el test: la busqué en el
// detalle de clase (que no lleva barra) y en la confirmación (a la que no supe
// llegar con los datos de muestra). El camino real es este.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SIN_RUTA_PROPIA = [
  { nombre: 'Favoritas', abrir: /^Favoritas$/ },
  { nombre: 'Historial', abrir: /Historial de clases/ },
];

for (const { nombre, abrir } of SIN_RUTA_PROPIA) {
  test(`se puede volver desde ${nombre}`, async ({ page }) => {
    await montarPortal(page, { conSesion: true, kit: 'sereno' });
    await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByRole('button', { name: abrir }).click({ timeout: 60_000 });

    // Estamos dentro: la pantalla tiene su flecha.
    const atras = page.getByRole('button', { name: 'Atrás' });
    await expect(atras).toBeVisible();

    await atras.click();

    // ⚠️ Lo que fallaba: esto no pasaba nunca. La flecha desaparece porque ya
    // no estamos en esa pantalla, y vuelve la barra de la sección.
    await expect(atras).toHaveCount(0);
    await expect(page.locator('.tab-bar')).toBeVisible();
  });
}

test('volver desde Favoritas abierta desde el Inicio, que es donde se veía', async ({ page }) => {
  // El camino exacto del reporte: acceso rápido del Inicio → Favoritas →
  // atrás. Aquí el destino de vuelta (`/home`) ES la URL actual, que es
  // justo la condición que rompía.
  await montarPortal(page, { conSesion: true, kit: 'sereno' });
  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Favoritas' }).click();
  const atras = page.getByRole('button', { name: 'Atrás' });
  await expect(atras).toBeVisible();

  await atras.click();

  await expect(atras).toHaveCount(0);
  await expect(page.getByText(/accesos rápidos/i)).toBeVisible();
});
