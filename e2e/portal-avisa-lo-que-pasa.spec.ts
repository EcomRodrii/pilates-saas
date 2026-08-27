import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El portal DICE lo que ha pasado — verificado sobre `<Toast>`
// (`components/portal/ui/Toast.tsx`), montado por las vistas reales
// (PortalClasesView, PortalReservasView, PortalPerfilView...) desde antes de
// que existiera el kit de temas.
//
// Esto se escribió montando el estudio con `kit: 'sereno'` y probando el
// aviso sobre la hoja de "tarjeta guardada" — una pantalla que resultó ser
// EXCLUSIVA del kit (`components/portal-tema/components/ui/hojas.tsx`): el
// portal de siempre nunca tuvo gestión de tarjeta guardada, solo domiciliación
// SEPA en /compras, un mecanismo distinto (redirige a un flujo externo, no
// hay «quitar»/«añadir» con confirmación in situ). Con `esTemaPortal()`
// cerrado para siempre, esa pantalla —y por tanto la funcionalidad de
// autoservicio para quitar una tarjeta guardada— ha quedado inalcanzable; ver
// `e2e/portal-tarjeta.spec.ts` (borrado) y el informe de esta migración.
//
// Lo que SÍ es núcleo y con Toast real detrás en el portal de siempre es
// cancelar una reserva: la cancelación pasa por el MISMO patrón (esperar la
// respuesta, avisar con lo que diga el servidor, nunca fingir éxito) y ya
// muestra tanto el aviso de error como el de confirmación.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('un fallo del servidor SE VE, no se traga', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  // El servidor rechaza cancelar la reserva.
  await page.route('**/api/public/reserva', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No se ha podido cancelar la reserva."}' }));

  await page.goto(`/portal/${SLUG}/clases`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();

  // ⚠️ Lo que fallaba: esto no aparecía por ninguna parte, y la socia se
  // quedaba creyendo que su reserva ya no estaba.
  await expect(page.getByText('No se ha podido cancelar la reserva.')).toBeVisible({ timeout: 15_000 });
});

test('una confirmación también se ve', async ({ page }) => {
  await montarPortal(page, { conSesion: true });

  await page.goto(`/portal/${SLUG}/clases`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();

  await expect(page.getByText('Reserva cancelada.')).toBeVisible({ timeout: 15_000 });
});
