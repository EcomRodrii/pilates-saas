import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de clases — verificado sobre `PortalReservasView`
// (`components/portal/portal-reservas-view.tsx`, ruta `/reservas`), que es
// donde vive esto en el portal de siempre. Escrito originalmente contra
// `/portal-tema-preview/sereno` (la previsualización del KIT, con una
// pantalla "Historial" dedicada que fusiona asistidas y canceladas en una
// sola lista) — esa pantalla no existe en el portal de siempre.
//
// El portal de siempre organiza lo mismo por PESTAÑAS dentro de una única
// pantalla «Mis reservas»: Próximas / Pasadas / Canceladas / Lista de espera
// (`porTab` en portal-reservas-view.tsx). Las dos cosas reales que protegía
// el fichero original migran así:
//
//   1. «Historial de clases» no es la agenda: en el portal de siempre esto es
//      automático — Próximas mira hacia delante y Pasadas/Canceladas hacia
//      atrás, son pestañas de la MISMA pantalla real («Mis reservas»), no una
//      agenda semanal con selector de día.
//   2. Nada se pierde ni se cuenta mal: una reserva CANCELADA nunca aparece
//      en Pasadas (el filtro de `porTab` la excluye a propósito — línea
//      "estado === 'ASISTIDA' || ... "), y sigue siendo visible de verdad en
//      su propia pestaña, Canceladas. Antes esto era un riesgo real de
//      cuadrar mal un bono si "Completadas" contara una cancelación.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('«Pasadas» de Mis reservas es el historial, no la agenda', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /^Pasadas/ }).click();

  await expect(page.getByText('Asistida').first()).toBeVisible();
  // Y NO es la agenda semanal: su selector de día no está por ninguna parte.
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveCount(0);
});

test('distingue lo asistido de lo cancelado, y no se pierde ninguna', async ({ page }) => {
  await montarPortal(page, { conSesion: true, historialConCancelada: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: /^Pasadas/ }).click();
  await expect(page.getByText('Asistida').first()).toBeVisible();

  // ⚠️ La cancelada TIENE que seguir viéndose en algún sitio: un historial que
  // la hace desaparecer del todo es media verdad, y la mitad que falta es la
  // que se mira al discutir un cargo.
  // `exact: true` porque la propia pestaña se llama "Canceladas (1)", que
  // contiene "Cancelada" como subcadena.
  await page.getByRole('tab', { name: /^Canceladas/ }).click();
  await expect(page.getByText('Cancelada', { exact: true }).first()).toBeVisible();
});

test('«Pasadas» NO cuenta la cancelada como completada', async ({ page }) => {
  // ⚠️ La regresión que vigila esto: si «Pasadas» no filtrara por estado, una
  // clase que la socia canceló aparecería como asistida — lo contrario de lo
  // que pasó de verdad, y encima le cuadraría mal el bono.
  await montarPortal(page, { conSesion: true, historialConCancelada: true });
  await page.goto(`/portal/${SLUG}/reservas`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });

  // 12 clases de muestra en el histórico; con una convertida a CANCELADA,
  // «Pasadas» debe enseñar 11 asistidas, ninguna cancelada.
  // `exact: true` porque la propia pestaña se llama "Canceladas (1)", que
  // contiene "Cancelada" como subcadena — sin `exact` el conteo de la
  // pastilla se confundiría con la etiqueta de la pestaña, SIEMPRE visible
  // esté cual esté activa.
  await page.getByRole('tab', { name: /^Pasadas/ }).click();
  await expect(page.getByText('Asistida', { exact: true })).toHaveCount(11);
  await expect(page.getByText('Cancelada', { exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: /^Canceladas/ }).click();
  await expect(page.getByText('Cancelada', { exact: true })).toHaveCount(1);
});
