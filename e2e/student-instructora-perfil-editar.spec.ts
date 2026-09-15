import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La instructora cambia sus datos desde la app del estudio (perfil editable,
// 15-sep-2026):
//   1. Ve su ficha rellena y guarda nombre, descripción y teléfono. Se manda
//      SOLO `slug` + `cambios`, nunca un id de ficha: la ficha sale del token.
//   2. Si el servidor dice que no, se señala el campo y no se da por guardado.
//   3. El correo se ve pero no se edita (cambiarlo va en otra fase).
//   4. La contraseña se cambia desde su parte: la guardia de la alumna no la echa.
//
// ⚠️ Cada camino de fallo lleva contador de intentos: «no pintó éxito» sería
// verdad también si la pantalla no hubiera llegado a enviar nada.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const FICHA = { nombre: 'Ana Ferrer', email: 'ana@example.com', telefono: '600112233', bio: 'Reformer y suelo pélvico.', fotoUrl: null };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opciones: { guardarFalla?: { error: string; campo: string } } = {}) {
  const contador = { leer: 0, guardar: 0, cuerpoGuardar: null as null | Record<string, unknown> };

  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/perfil/datos', (route) => {
    const peticion = route.request();
    if (peticion.method() !== 'PATCH') {
      contador.leer++;
      return json(route, FICHA);
    }
    contador.guardar++;
    const cuerpo = JSON.parse(peticion.postData() || '{}') as Record<string, unknown>;
    contador.cuerpoGuardar = cuerpo;
    if (opciones.guardarFalla) return json(route, opciones.guardarFalla, 400);
    const cambios = cuerpo.cambios as { nombre: string; bio: string; telefono: string };
    return json(route, { ...FICHA, nombre: cambios.nombre, bio: cambios.bio || null, telefono: cambios.telefono || null });
  });
  return contador;
}

test.describe('La instructora cambia sus datos desde la app', () => {
  test('ve su ficha rellena y guarda nombre, descripción y teléfono sin mandar ningún id', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil/datos`);

    const nombre = page.getByLabel('Nombre', { exact: true });
    await expect(nombre).toHaveValue('Ana Ferrer', { timeout: 30_000 });
    expect(contador.leer).toBeGreaterThan(0);
    // El correo se enseña, pero no se cambia aquí.
    const correo = page.getByLabel('Correo', { exact: true });
    await expect(correo).toHaveValue('ana@example.com');
    await expect(correo).toBeDisabled();

    await nombre.fill('Ana María Ferrer');
    await page.getByLabel('Descripción', { exact: true }).fill('Clases de Reformer para cuidar la espalda.');
    await page.getByLabel('Teléfono', { exact: true }).fill('+34 611 22 33 44');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();

    await expect(page.getByText('Datos guardados ✓')).toBeVisible({ timeout: 15_000 });
    expect(contador.guardar).toBe(1);
    expect(contador.cuerpoGuardar).toEqual({
      slug: SLUG,
      cambios: { nombre: 'Ana María Ferrer', bio: 'Clases de Reformer para cuidar la espalda.', telefono: '+34 611 22 33 44' },
    });
  });

  test('si el servidor dice que no, señala el campo y no lo da por guardado', async ({ page }) => {
    const contador = await montar(page, { guardarFalla: { error: 'Ese teléfono no parece válido.', campo: 'telefono' } });
    await page.goto(`/portal/${SLUG}/equipo/perfil/datos`);

    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana Ferrer', { timeout: 30_000 });
    await page.getByLabel('Teléfono', { exact: true }).fill('llámame');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Ese teléfono no parece válido.' })).toBeVisible({ timeout: 15_000 });
    expect(contador.guardar).toBe(1);
    await expect(page.getByText('Datos guardados ✓')).toHaveCount(0);
  });

  test('sin nombre no llega a mandar nada y lo dice', async ({ page }) => {
    const contador = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil/datos`);

    const nombre = page.getByLabel('Nombre', { exact: true });
    await expect(nombre).toHaveValue('Ana Ferrer', { timeout: 30_000 });
    await nombre.fill('   ');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Escribe tu nombre.' })).toBeVisible();
    expect(contador.guardar).toBe(0);
  });

  test('cambia la contraseña desde su parte: la guardia de la alumna no la echa', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil/seguridad`);

    await expect(page.getByRole('heading', { name: 'Contraseña', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Contraseña actual', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/perfil/seguridad$`));
  });

  test('desde Perfil llega a sus datos y a la contraseña', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil`);

    await expect(page.getByRole('link', { name: 'Contraseña', exact: true }))
      .toHaveAttribute('href', `/portal/${SLUG}/equipo/perfil/seguridad`, { timeout: 30_000 });
    await page.getByRole('link', { name: 'Tus datos', exact: true }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana Ferrer', { timeout: 30_000 });
  });
});
