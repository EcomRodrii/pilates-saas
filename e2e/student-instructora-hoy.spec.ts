import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// «Hoy» de la instructora no se queda vacío aunque tenga pocas clases
// (15-sep-2026): debajo de su semana van sus accesos, sus mensajes y su nota.
//
//   1. Cuatro accesos con sus destinos; «Nueva clase» solo si el estudio le deja.
//   2. Mensajes: cuántos sin leer y el último, o cómo empezar si no hay ninguno.
//   3. Valoraciones: la línea neutra mientras no hay datos suficientes.
//   4. Si la bandeja falla, su tarjeta no sale y el resto de «Hoy» sí.
//
// ⚠️ El caso de fallo lleva contador: «no pintó la tarjeta» sería verdad también
// si la pantalla no hubiera llegado a pedir la bandeja.
// ─────────────────────────────────────────────────────────────────────────────

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const HILO_SIN_LEER = {
  id: 'conv-1', studio_id: 'studio-e2e', tipo: 'ALUMNA_INSTRUCTORA',
  creado_en: '2026-09-10T09:00:00.000Z',
  ultimo_mensaje_en: '2026-09-14T09:00:00.000Z',
  ultimo_cuerpo: '¿Mañana hacemos suelo pélvico?',
  ultimo_remitente_auth_user_id: 'usuario-alumna',
  leido_hasta: '2026-09-12T09:00:00.000Z',
  alumna: { socioId: 'soc-1', nombre: 'Aina P.', fotoUrl: null },
};

async function montar(page: Page, opciones: { puedeCrearClases?: boolean; hilos?: unknown[]; mensajesFalla?: boolean } = {}) {
  const contador = { hilos: 0 };
  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) =>
    json(route, { clases: [], bajas: [], puedeCrearClases: opciones.puedeCrearClases ?? false }));
  await page.route('**/api/portal/instructora/ofertas', (route) => json(route, { ofertas: [] }));
  await page.route('**/api/portal/instructora/perfil', (route) =>
    json(route, { estudios: [], tarifa: null, valoraciones: null }));
  await page.route('**/api/portal/instructora/mensajes', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as { accion?: string };
    if (cuerpo.accion !== 'hilos') return json(route, { error: 'no esperado' }, 400);
    contador.hilos++;
    if (opciones.mensajesFalla) return json(route, { error: 'No se han podido cargar tus mensajes' }, 500);
    return json(route, { hilos: opciones.hilos ?? [] });
  });
  return contador;
}

test.describe('«Hoy» de la instructora con pocas clases', () => {
  test('enseña sus accesos, cuántos mensajes tiene sin leer y su nota', async ({ page }) => {
    const contador = await montar(page, { hilos: [HILO_SIN_LEER] });
    await page.goto(`/portal/${SLUG}/equipo`);

    const accesos = page.getByRole('navigation', { name: 'Accesos rápidos' });
    await expect(accesos.getByRole('link')).toHaveCount(4, { timeout: 30_000 });
    await expect(accesos.getByRole('link', { name: /Disponible/ })).toHaveAttribute('href', `/portal/${SLUG}/equipo/disponibilidad`);
    await expect(accesos.getByRole('link', { name: /Ausencias/ })).toHaveAttribute('href', `/portal/${SLUG}/equipo/ausencias`);
    await expect(accesos.getByRole('link', { name: /Nueva clase/ })).toHaveCount(0);

    const mensajes = page.getByTestId('mensajes-hoy');
    await expect(mensajes).toContainText('1 sin leer');
    await expect(mensajes).toContainText('¿Mañana hacemos suelo pélvico?');
    await expect(mensajes).toContainText('Aina P.');
    expect(contador.hilos).toBeGreaterThan(0);

    await expect(page.getByTestId('valoraciones-hoy')).toContainText('Cuando al menos 5 alumnas');
  });

  test('sin conversaciones, la tarjeta de mensajes le dice cómo empezar', async ({ page }) => {
    await montar(page, { hilos: [] });
    await page.goto(`/portal/${SLUG}/equipo`);

    const mensajes = page.getByTestId('mensajes-hoy');
    await expect(mensajes).toContainText('Escríbele desde su ficha', { timeout: 30_000 });
    await expect(mensajes).not.toContainText('sin leer');
  });

  test('si el estudio le deja crear clases, «Nueva clase» es el primer acceso', async ({ page }) => {
    await montar(page, { puedeCrearClases: true });
    await page.goto(`/portal/${SLUG}/equipo`);

    const enlaces = page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link');
    await expect(enlaces).toHaveCount(4, { timeout: 30_000 });
    await expect(enlaces.first()).toHaveAttribute('href', `/portal/${SLUG}/equipo/nueva-clase`);
  });

  test('si la bandeja falla, no sale su tarjeta y el resto de «Hoy» sí', async ({ page }) => {
    const contador = await montar(page, { mensajesFalla: true });
    await page.goto(`/portal/${SLUG}/equipo`);

    await expect(page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link')).toHaveCount(4, { timeout: 30_000 });
    await expect(page.getByTestId('resumen-semana')).toBeVisible();
    await expect.poll(() => contador.hilos).toBeGreaterThan(0);
    await expect(page.getByTestId('mensajes-hoy')).toHaveCount(0);
  });
});
