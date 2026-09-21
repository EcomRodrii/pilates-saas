import { test, expect, type Page, type Route } from '@playwright/test';
import { SLUG, STUDIO_ID, sembrarSociaLista } from './socia-lista';
import { montarPortal } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Push por TIPO de aviso (migr 20260921132122), en la app de la alumna y en la
// de la instructora:
//   1. El valor de partida es el EFECTIVO: la excepción del tipo o, si no hay,
//      su categoría. Quien apagó «reservas» entera antes de esto la ve apagada
//      tipo a tipo, no encendida de golpe.
//   2. Un toque guarda SOLO ese tipo, sin mandar categoría (la decide el servidor).
//   3. Si el servidor dice que no, el interruptor vuelve atrás y se avisa.
//
// ⚠️ El camino de fallo lleva contador de intentos: «volvió atrás» sería verdad
// también si la pantalla no hubiera llegado a enviar nada.
// ─────────────────────────────────────────────────────────────────────────────

type Peticion = Record<string, unknown>;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockPreferencias(page: Page, prefs: Record<string, unknown>, estadoPut = 200) {
  const puts: Peticion[] = [];
  await page.route('**/api/notifications/preferences', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, { prefs });
    puts.push(req.postDataJSON() as Peticion);
    return json(route, estadoPut === 200 ? { ok: true } : { error: 'boom' }, estadoPut);
  });
  return puts;
}

const interruptor = (page: Page, nombre: string) => page.getByRole('switch', { name: nombre, exact: true });

test.describe('Alumna · push por tipo de aviso', () => {
  async function montar(page: Page, estadoPut = 200) {
    await sembrarSociaLista(page);
    await page.route((u) => u.pathname === '/api/notifications', (r) => json(r, { items: [] }));
    return mockPreferencias(page, {
      // La categoría entera apagada, con UNA excepción encendida.
      reservas: { inapp: true, push: false, email: false, pushEventos: { 'reserva.recordatorio_24h': true } },
      pagos: { inapp: true, push: true, email: true, pushEventos: {} },
    }, estadoPut);
  }

  test('parte del valor efectivo: excepción del tipo o, si no, su categoría', async ({ page }) => {
    await montar(page);
    await page.goto(`/portal/${SLUG}/perfil/preferencias`);

    await expect(interruptor(page, 'El día antes')).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await expect(interruptor(page, 'Una hora antes')).toHaveAttribute('aria-checked', 'false');
    await expect(interruptor(page, 'Reserva confirmada')).toHaveAttribute('aria-checked', 'false');
    // Sin fila de `clases`: encendido, que es el defecto del motor.
    await expect(interruptor(page, 'Clase cancelada')).toHaveAttribute('aria-checked', 'true');
    await expect(interruptor(page, 'Bono agotado')).toHaveAttribute('aria-checked', 'true');
    // El email sigue siendo por categoría.
    await expect(interruptor(page, 'Recibos y confirmaciones por email')).toHaveAttribute('aria-checked', 'true');
    // El interruptor que no apagaba nada ya no está.
    await expect(page.getByText('Novedades del estudio')).toHaveCount(0);
  });

  test('un toque guarda solo ese tipo, sin categoría', async ({ page }) => {
    const puts = await montar(page);
    await page.goto(`/portal/${SLUG}/perfil/preferencias`);

    const unaHora = interruptor(page, 'Una hora antes');
    await expect(unaHora).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
    await unaHora.click();

    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toEqual({ studioId: STUDIO_ID, evento: 'reserva.recordatorio_1h', push: true });
    await expect(unaHora).toHaveAttribute('aria-checked', 'true');
    // Y no arrastra a los demás de su categoría.
    await expect(interruptor(page, 'Reserva confirmada')).toHaveAttribute('aria-checked', 'false');
  });

  test('si el servidor no lo guarda, el interruptor vuelve atrás y lo dice', async ({ page }) => {
    const puts = await montar(page, 500);
    await page.goto(`/portal/${SLUG}/perfil/preferencias`);

    const dia = interruptor(page, 'El día antes');
    await expect(dia).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await dia.click();

    await expect(page.getByText('No hemos podido guardar ese cambio.')).toBeVisible({ timeout: 15_000 });
    expect(puts.length).toBeGreaterThan(0);
    await expect(dia).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Instructora · push por tipo de aviso', () => {
  async function montar(page: Page) {
    await montarPortal(page, { conSesion: true, sinSocia: true });
    await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
    await page.route('**/api/portal/instructora/sesion', (route) =>
      json(route, { instructora: { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null } }));
    return mockPreferencias(page, {
      sustituciones: { inapp: true, push: true, email: false, pushEventos: {} },
    });
  }

  test('llega desde su perfil y apaga un tipo sin tocar el resto', async ({ page }) => {
    const puts = await montar(page);
    await page.goto(`/portal/${SLUG}/equipo/perfil`);
    await page.getByRole('link', { name: /Avisos en el móvil/ }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/equipo/perfil/avisos`), { timeout: 30_000 });

    const cubrir = interruptor(page, 'Te piden cubrir una clase');
    await expect(cubrir).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    // Solo lo suyo: nada de avisos de alumna aquí.
    await expect(interruptor(page, 'Bono agotado')).toHaveCount(0);

    await cubrir.click();
    await expect.poll(() => puts.length).toBe(1);
    expect(puts[0]).toEqual({ studioId: STUDIO_ID, evento: 'sustitucion.ofrecida', push: false });
    await expect(cubrir).toHaveAttribute('aria-checked', 'false');
    await expect(interruptor(page, 'Clase nueva asignada')).toHaveAttribute('aria-checked', 'true');
  });
});
