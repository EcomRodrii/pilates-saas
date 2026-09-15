import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// I-14 (auditoría 15-sep): dos pantallas de Configuración con un «Guardar» de
// verdad se quedaban FUERA de la guardia de salida — llevaban su propio botón
// (Horario de citas) o una barra que se veía IGUAL pero no avisaba a nadie
// (Textos de tu app, `BarraCambiosEstudio`, que imitaba el estilo de
// `BarraGuardar` sin llamar a `marcarSinGuardar` ni a `beforeunload`). Cambiar
// de sección o cerrar la pestaña con cambios sin guardar en cualquiera de las
// dos no avisaba de nada: la propietaria los perdía en silencio.
//
// Las dos ahora usan `BarraGuardar`, la misma pieza que ya prueba
// `configuracion-barra-guardar.spec.ts` para el resto de secciones. Aquí solo
// se fija la regresión concreta: que SALEN de la guardia, no el resto de su
// contrato (ya cubierto allí).
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Pediría el navegador confirmación al recargar o cerrar la pestaña? */
const pideConfirmarAlSalir = (page: Page) => page.evaluate(() => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});

const barra = (page: Page) => page.getByRole('region', { name: 'Cambios sin guardar' });
const dialogoSalir = (page: Page) => page.getByRole('dialog', { name: '¿Salir sin guardar?' });

test.describe('I-14: Horario de citas entra en la guardia de salida', () => {
  test('editar una franja sin guardar avisa al salir, en vez de dejarla ir en silencio', async ({ page }) => {
    await montar(page);
    await ir(page, 'configuracion?tab=horario-citas');
    await expect(page.getByRole('heading', { name: 'Horario de citas', exact: true })).toBeVisible({ timeout: 30_000 });

    expect(await pideConfirmarAlSalir(page), 'sin tocar nada, no pregunta').toBe(false);
    await expect(barra(page)).toHaveCount(0);

    // Añade una franja al lunes: cambio sin guardar.
    await page.getByRole('button', { name: 'Franja' }).first().click();
    await expect(barra(page)).toContainText('Cambios sin guardar en: Horario de citas');
    expect(await pideConfirmarAlSalir(page), 'con la franja sin guardar, sí pregunta').toBe(true);

    // Cambiar de sección pregunta, con el diálogo de siempre — antes se iba sin más.
    const rail = page.getByRole('navigation', { name: 'Secciones de Configuración' });
    await rail.getByRole('link', { name: 'Cómo reservan mis alumnas', exact: true }).click();
    await expect(dialogoSalir(page)).toBeVisible();
    await expect(dialogoSalir(page)).toContainText('Los cambios de «Mis clases y citas» se perderán.');
    await dialogoSalir(page).getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL(/\?tab=horario-citas$/);
  });
});

test.describe('I-14: Textos de tu app entra en la guardia de salida', () => {
  test('editar un texto sin guardar avisa al salir — antes su barra imitaba el aviso sin darlo', async ({ page }) => {
    await montar(page);
    await ir(page, 'configuracion?tab=marca#textos-de-tu-app');
    await expect(page.getByRole('heading', { name: 'Textos de tu app', exact: true })).toBeVisible({ timeout: 30_000 });

    expect(await pideConfirmarAlSalir(page), 'sin tocar nada, no pregunta').toBe(false);
    await expect(barra(page)).toHaveCount(0);

    await page.getByLabel('Tu lema').fill('Cuerpo, mente, equilibrio');
    await expect(barra(page)).toContainText('Cambios sin guardar en: Textos de tu app');
    expect(await pideConfirmarAlSalir(page), 'con el lema sin guardar, sí pregunta').toBe(true);

    const rail = page.getByRole('navigation', { name: 'Secciones de Configuración' });
    await rail.getByRole('link', { name: 'Mi app y mi web', exact: true }).click();
    await expect(dialogoSalir(page)).toBeVisible();
    await expect(dialogoSalir(page)).toContainText('Los cambios de «Marca» se perderán.');
    await dialogoSalir(page).getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(/\?tab=web$/);
    expect(await pideConfirmarAlSalir(page), 'lo descartado ya no pregunta').toBe(false);
  });
});
