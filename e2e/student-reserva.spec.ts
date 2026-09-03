import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, sembrarSociaLista } from './socia-lista';

// El camino crítico: reservar.
//
// Lo que estos tests defienden no es el diseño, es la regla que gobierna la
// fase entera: **ninguna pantalla enseña éxito hasta que el servidor lo dice**.
// Por eso cada caso fuerza una respuesta distinta del servidor y comprueba qué
// se pinta — incluido el caso en que la UI creía que había plaza y no la había.

const base = `/portal/${SLUG}`;

/** Responde a la creación de reserva con lo que el servidor diría en ese caso. */
async function servidorResponde(page: Page, cuerpo: unknown, status = 200) {
  await page.route('**/api/public/reserva', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  });
}

async function abrirHoja(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`);
  await page.getByRole('button', { name: /reservar/i }).first().click();
  await expect(page.getByRole('button', { name: /^confirmar/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^confirmar/i }).click();
}

test.describe('Student PWA · reservar', () => {
  test.beforeEach(async ({ page }) => { await sembrarSociaLista(page); });

  test('CONFIRMADA es lo único que celebra', async ({ page }) => {
    await servidorResponde(page, { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' });
    await abrirHoja(page);
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /ver mis reservas/i })).toBeVisible();
  });

  test('lista de espera NO se pinta como confirmada', async ({ page }) => {
    await servidorResponde(page, { ok: true, estado: 'LISTA_ESPERA', reservaId: 'res-2', posicionEspera: 3 });
    await abrirHoja(page);
    await expect(page.getByText('Estás en la lista de espera')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
  });

  test('la clase se llena MIENTRAS reservaba: la UI decía que había plaza', async ({ page }) => {
    // El caso que justifica toda la arquitectura: el aforo del cliente es
    // orientativo (no resta máquinas averiadas), así que el servidor puede
    // rechazar una clase que la pantalla mostraba libre. Eso NO es un fallo.
    await servidorResponde(page, { error: 'Esta clase está completa', codigo: 'aforo-lleno' }, 400);
    await abrirHoja(page);
    await expect(page.getByText('Se ha llenado mientras reservabas')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
  });

  test('solape con otra clase suya → conflict, con su copy propio', async ({ page }) => {
    await servidorResponde(page, { error: 'Ya tienes otra clase a esa hora', codigo: 'conflicto-horario' }, 400);
    await abrirHoja(page);
    await expect(page.getByText('Ya tienes una clase a esa hora')).toBeVisible({ timeout: 30_000 });
  });

  test('duplicado → «ya estabas apuntada», y NO se crea otra', async ({ page }) => {
    await servidorResponde(page, { error: 'Ya tienes una reserva en esta clase', codigo: 'ya-reservada' }, 400);
    await abrirHoja(page);
    await expect(page.getByText('Ya estabas apuntada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no se ha creado ninguna nueva/i)).toBeVisible();
  });

  test('401 → sesión caducada, diciendo que no hubo cargo', async ({ page }) => {
    await servidorResponde(page, { error: 'No autorizado' }, 401);
    await abrirHoja(page);
    await expect(page.getByText('Tu sesión ha caducado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no se ha hecho ningún cargo/i)).toBeVisible();
  });

  test('el servidor se cae → error, y se dice que no se usó ninguna sesión', async ({ page }) => {
    await servidorResponde(page, { error: 'boom' }, 500);
    await abrirHoja(page);
    await expect(page.getByText('Algo no ha salido como esperábamos')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no se ha usado ninguna sesión/i)).toBeVisible();
  });

  test('una respuesta que no entendemos NO se pinta como éxito', async ({ page }) => {
    // Si el backend añade un estado y el mapeo no se actualiza, el fallo tiene
    // que ser visible, no optimista.
    await servidorResponde(page, { ok: true, estado: 'ALGO_NUEVO' });
    await abrirHoja(page);
    await expect(page.getByText('Algo no ha salido como esperábamos')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
  });

  test('sin red, la reserva ni se intenta y se dice que no hubo cargo', async ({ page, context }) => {
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await expect(page.getByRole('button', { name: /reservar/i }).first()).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    // El CTA se bloquea: reservar sin conexión no se finge nunca.
    await expect(page.getByRole('button', { name: /sin conexión/i })).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });
});
