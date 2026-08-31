import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// PERFIL — la octava y última pantalla del prototipo. El diseño la convierte en
// un índice de filas, así que lo que hay que fijar es que NADA de lo que se
// editaba antes se haya quedado por el camino, y las cuatro decisiones que se
// apartan del lienzo a propósito.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Perfil', () => {
  test.beforeEach(async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/perfil`);
    await expect(page.getByRole('heading', { name: /Marta/ })).toBeVisible({ timeout: 30_000 });
  });

  test('la cabecera dice quién eres y desde cuándo', async ({ page }) => {
    await expect(page.getByText('Socia desde enero de 2026')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar tu foto' })).toBeVisible();
  });

  test('las tres tarjetas de estadística son siempre las mismas tres', async ({ page }) => {
    // Verificado contra capturas reales de Claude Design (31-ago): ya no son
    // condicionales ("Clases asistidas" histórico, que desaparecía sin bono
    // ni plaza fija) — son SIEMPRE estas tres, con 0 como valor legítimo:
    // clases de ESTE MES, sesiones de bono, favoritos.
    await expect(page.getByText('clases este mes')).toBeVisible();
    await expect(page.getByText('sesiones de bono')).toBeVisible();
    await expect(page.getByText('favoritos', { exact: true })).toBeVisible();
    // "Sesiones de bono" y "favoritos" sí son deterministas contra el mock
    // (SUSCRIPCION.sesionesRestantes=8; favoritos por defecto = []) —
    // "clases este mes" depende del día en que corra la suite (HISTORIAL_BASE
    // usa offsets relativos a `Date.now()`, la misma trampa de fecha fija
    // cruzando de mes que ya documenta este repo en otras specs), así que no
    // se fija su cifra aquí.
    const stats = page.locator('div').filter({ hasText: /^\d+sesiones de bono$/ });
    await expect(stats).toContainText('8');
    const favs = page.locator('div').filter({ hasText: /^\d+favoritos$/ });
    await expect(favs).toContainText('0');
  });

  test('«Tus favoritos» tiene su propia sección, con estado vacío por defecto', async ({ page }) => {
    await expect(page.getByText('Tus favoritos', { exact: true })).toBeVisible();
    await expect(page.getByText('Aún no tienes — toca el ♡ de una clase y aparecerá aquí.')).toBeVisible();
  });

  test('«Tu actividad» reemplaza a «Tu progreso», con el mismo dato de racha', async ({ page }) => {
    await expect(page.getByText('Tu progreso', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Tu actividad', { exact: true })).toBeVisible();
  });

  test('la promoción cruzada a Tentare Network usa el logo real, no un emoji', async ({ page }) => {
    await expect(page.getByText('¿Quieres probar otros estudios?')).toBeVisible();
    await expect(page.getByText('Descárgate Tentare Network')).toBeVisible();
    await expect(page.getByText('🩷')).toHaveCount(0);
  });

  test('NO hay ficha de salud', async ({ page }) => {
    // Decisión de producto: el portal no guarda datos de salud.
    await expect(page.getByText(/[Ff]icha de salud/)).toHaveCount(0);
  });

  // ⚠️ El Email SALIÓ de esta hoja: ahora vive en una hoja separada, "Cambiar
  // email" (botón propio en Perfil, formulario con label "Nuevo email"), que
  // pasa por `actualizarEmail()` (auth.updateUser) en vez de escribir
  // `socios.email` directo — ver e2e/portal-mis-datos.spec.ts, que ya cubre
  // ese flujo entero (no se duplica aquí). Lo que queda por comprobar es que
  // "Mis datos" sigue trayendo el resto del formulario completo.
  test('«Mis datos» abre la hoja con el formulario entero', async ({ page }) => {
    await page.getByRole('button', { name: 'Mis datos' }).click();
    for (const campo of ['Nombre', 'Apellidos', 'Teléfono', 'Fecha de nacimiento', 'Dirección']) {
      await expect(page.getByLabel(campo)).toBeVisible();
    }
    await expect(page.getByPlaceholder('Email')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
  });

  test('el interruptor día/noche sigue estando, aunque el lienzo no lo dibuje', async ({ page }) => {
    // Es un switch, no una fila que navega: se declara como tal y enseña su
    // estado en vez de una flecha que no lleva a ningún sitio.
    const modo = page.getByRole('switch', { name: /Aspecto/ });
    await expect(modo).toBeVisible();
    await expect(modo).toHaveAttribute('aria-checked', 'false');
    await expect(modo).toContainText('Día');
    await modo.click();
    await expect(modo).toHaveAttribute('aria-checked', 'true');
    await expect(modo).toContainText('Noche');
  });

  test('«El estudio» informa, y no promete una flecha que no lleva a nada', async ({ page }) => {
    const fila = page.getByText('El estudio').locator('..');
    await expect(fila).toContainText('Marbella');
    await expect(fila).not.toContainText('→');
  });

  test('el pie lleva el nombre del estudio, no el nuestro', async ({ page }) => {
    // Marca blanca: la clienta entra a su estudio, no a Tentare.
    await expect(page.getByText('Estudio Alma', { exact: true })).toBeVisible();
    await expect(page.getByText('TENTARE', { exact: true })).toHaveCount(0);
  });

  test('«Métodos de pago» lleva a Compras', async ({ page }) => {
    await page.getByRole('button', { name: 'Métodos de pago' }).click();
    // Timeout explícito: con `next dev`, la primera navegación a /compras
    // compila la ruta bajo demanda y se pasa de los 5s por defecto.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/compras$`), { timeout: 30_000 });
  });
});
