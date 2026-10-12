import { test, expect, type Page } from '@playwright/test';
import { abrirClaseConReservas as abrir } from './calendario-clase-con-reservas';

// ─────────────────────────────────────────────────────────────────────────────
// «Eliminar clase» cancela las reservas y las libera POR EL SERVIDOR antes de borrar.
//
// Antes borraba la clase primero (el borrado se lleva las reservas por cascada) y después
// sumaba una sesión «a ciegas» al bono que pareciera: sin la reserva no había forma de saber
// qué bono pagó cada plaza, ni si la había pagado un bono (una plaza fija o una pagada con
// una recuperación no consumieron ninguno), ni de no devolver dos veces.
//
// Ahora el orden es: marcar la clase cancelada → cancelar sus reservas → `/api/reservas/
// devolver-bonos` (que libera cada reserva con `liberar_derecho`) → borrar. Y si alguna
// devolución falla NO se borra: las reservas son lo único que dice a quién hay que devolver.
//
// Con contador: que «no se borra» sea cierto solo vale si se demuestra que SÍ se intentó
// devolver (si el servidor nunca se llamara, la clase tampoco se borraría y el test pasaría
// por una razón equivocada).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

async function eliminarLaClase(page: Page) {
  await page.getByRole('button', { name: 'Más acciones de la clase' }).click({ timeout: 30_000 });
  await page.getByRole('menu', { name: 'Más acciones de la clase' }).getByRole('menuitem', { name: /^Eliminar/ }).click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Eliminar clase' }).click();
}

test('eliminar una clase cancela y libera sus reservas por el servidor ANTES de borrarla', async ({ page }) => {
  const { orden, cuerposDevolver } = await abrir(page, { status: 200, cuerpo: { devueltas: 1, recuperaciones: 0, fallos: 0, saldos: [] } });
  await eliminarLaClase(page);

  await expect.poll(() => orden.includes('DELETE sesiones'), { timeout: 20_000 }).toBe(true);
  expect(cuerposDevolver.length, 'el servidor nunca recibió la devolución').toBeGreaterThan(0);

  const reservasCanceladas = orden.indexOf('PATCH reservas');
  const devolucion = orden.indexOf('POST devolver-bonos');
  const borrado = orden.indexOf('DELETE sesiones');
  expect(reservasCanceladas, 'no se cancelaron las reservas').toBeGreaterThanOrEqual(0);
  expect(reservasCanceladas, 'se devolvió antes de cancelar las reservas').toBeLessThan(devolucion);
  expect(devolucion, 'se borró la clase ANTES de devolver: el borrado se lleva las reservas por cascada').toBeLessThan(borrado);

  // Dice POR QUÉ, y manda las reservas (no un +1 a ciegas por socia). La plaza fija viaja también
  // y es el servidor quien la deja fuera.
  expect(cuerposDevolver[0].motivo).toBe('eliminar_clase');
  expect(cuerposDevolver[0].reservaIds).toEqual(expect.arrayContaining(['res-eliminar-1']));
});

test('si el servidor no puede devolver, la clase NO se borra', async ({ page }) => {
  const { orden, cuerposDevolver } = await abrir(page, { status: 500, cuerpo: { error: 'No se ha podido devolver el bono.' } });
  await eliminarLaClase(page);

  // Se intentó devolver (contador): sin esto el test pasaría aunque nunca se hubiera llamado.
  await expect.poll(() => cuerposDevolver.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  expect(orden, 'se borró la clase con una devolución sin hacer: se pierde a quién había que devolver').not.toContain('DELETE sesiones');
});
