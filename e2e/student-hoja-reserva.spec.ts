import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La hoja de reserva, sacada de la ficha para que la fila del horario abra LA MISMA (`HojaReserva` + `useHojaReserva`).
// Las guardas de siempre (student-reserva, student-hoja-confirmar-reserva, student-desenlace-reserva,
// student-lista-espera-por-tipo) prueban el traslado sin tocarse. Aquí, lo que cambia A PROPÓSITO en la ficha:
//
//  1. Tras confirmar no aparece el esqueleto a mitad de la celebración: se relee en silencio.
//  2. Tras «aforo-lleno» no se ofrece una lista de espera que la clase no tiene (el servidor solo lo dice entonces).
//  3. El botón que cierra dice «Volver a la clase» (decía «Volver al horario» y no salía de la ficha).
//  4. La nota de la lista de espera ya no dice «y tú confirmas»: la plaza se da sola.
//  5. Si la clase empieza con la hoja abierta, no se puede confirmar.
//
// Cada camino que escribe lleva su contador: «no se mintió» no vale si no se llegó a pedir nada.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page, o: { llena?: boolean; conBono?: boolean; relojMadrid?: boolean } = {}) {
  await sembrarSociaLista(page, { relojMadrid: o.relojMadrid });
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  if (o.conBono) {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  if (o.llena) {
    // El aforo llega por dos vías y las dos dicen lo mismo: el payload y `/api/public/aforo`.
    const ocupado = Array.from({ length: 10 }, () => ({ sesion_id: SESION_ID, estado: 'CONFIRMADA' }));
    f.aforoReservas = ocupado;
    await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: ocupado })));
  }
  let datos = 0;
  await page.route('**/api/public/studio-data', (r) => { datos += 1; return r.fulfill(json(f)); });
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  const reservas: unknown[] = [];
  return {
    pedidasDatos: () => datos,
    reservas,
    async responder(cuerpo: unknown, status = 200) {
      await page.route('**/api/public/reserva', (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        reservas.push(r.request().postDataJSON());
        return r.fulfill(json(cuerpo, status));
      });
    },
  };
}

async function abrirYConfirmar(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 45_000 });
  await page.getByRole('button', { name: /^Confirmar/ }).click();
}

test.describe('Student PWA · la hoja de reserva, sacada de la ficha', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('tras confirmar, la celebración se queda y los datos se releen sin esqueleto', async ({ page }) => {
    const m = await montar(page, { conBono: true });
    await m.responder({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' });
    await abrirYConfirmar(page);
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    expect(m.reservas.length, 'la reserva no llegó a pedirse').toBeGreaterThan(0);
    // Se relee (la reserva invalida el catálogo) y la hoja sigue celebrando: con el esqueleto de antes, desaparecía.
    await expect.poll(() => m.pedidasDatos(), { timeout: 15_000 }).toBeGreaterThan(1);
    await page.waitForTimeout(800);
    await expect(page.getByText('Reserva confirmada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver mis reservas' })).toBeVisible();
  });

  test('«aforo-lleno»: la clase no tiene lista de espera, y la hoja no la ofrece', async ({ page }) => {
    const m = await montar(page, { conBono: true });
    await m.responder({ error: 'Esta clase está completa', codigo: 'aforo-lleno' }, 400);
    await abrirYConfirmar(page);
    await expect(page.getByText('Se ha llenado mientras reservabas')).toBeVisible({ timeout: 30_000 });
    expect(m.reservas.length, 'la reserva no llegó a pedirse').toBeGreaterThan(0);
    await expect(page.getByText(/esta clase no tiene lista de espera/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Unirme a la lista de espera/ })).toHaveCount(0);
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
  });

  test('tras un rechazo, «Volver a la clase» cierra la hoja y deja en la ficha', async ({ page }) => {
    const m = await montar(page, { conBono: true });
    await m.responder({ error: 'Ya tienes una clase a esa hora', codigo: 'conflicto-horario' }, 409);
    await abrirYConfirmar(page);
    await expect(page.getByText('Ya tienes una clase a esa hora')).toBeVisible({ timeout: 30_000 });
    expect(m.reservas.length, 'la reserva no llegó a pedirse').toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Volver al horario' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Volver a la clase' }).click();
    await expect(page).toHaveURL(new RegExp(`/reservar/${SESION_ID}$`));
    await expect(page.getByText('Ya tienes una clase a esa hora')).not.toBeInViewport();
  });

  test('la lista de espera: sin coste al apuntarse, y sin prometer que ella confirma nada', async ({ page }) => {
    await montar(page, { conBono: true, llena: true });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /lista de espera/i }).first().click({ timeout: 45_000 });
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja).toContainText('Sin coste al apuntarte. Si se libera una plaza, te avisamos; al entrar cuenta como una reserva normal.');
    expect(await hoja.innerText()).not.toContain('tú confirmas');
  });

  test('si la clase empieza con la hoja abierta, ya no se puede confirmar', async ({ page }) => {
    const m = await montar(page, { conBono: true, relojMadrid: true });
    await m.responder({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: /^Confirmar/ })).toBeVisible();
    // La clase del fixture es a las 10:00 (sin zona: hora de la máquina) y el reloj, a las 08:00 de Madrid. Cinco horas
    // después ha empezado (y terminado) tanto con la máquina en Madrid como en UTC (el CI).
    await page.clock.fastForward('05:00:00');
    // Dentro de la HOJA: la barra fija de abajo dice lo mismo.
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja.getByRole('button', { name: 'La clase ya ha empezado' })).toBeDisabled({ timeout: 30_000 });
    await expect(hoja.getByRole('button', { name: /^Confirmar/ })).toHaveCount(0);
    expect(m.reservas, 'se mandó una reserva de una clase ya empezada').toHaveLength(0);
  });
});
