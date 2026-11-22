import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// «Valorar la clase ★» en el detalle de una reserva (paquete: mis-reservas/[bookingId]).
//
// Regla de producto: solo tras ASISTIR. La decide el servidor
// (`/api/public/valorar-clase`); la pantalla solo la refleja. Lo que rompe a
// una alumna: estrellas muertas en una clase a la que no fue, o una valoración
// que «se envía» y no llega.

const base = `/portal/${SLUG}`;
const RESERVA_ID = 'res-asistida';

interface Peticion { method: string; auth: string | undefined; body: Record<string, unknown> | null }

/** Lo que el servidor añade a la respuesta de una valoración: el premio y el enlace de reseñas del estudio. */
const PREMIO = { codigo: 'GRACIAS-AB12CD', tipo: 'PORCENTAJE', valor: 10, expira: '2026-12-19', vigente: true, canjeado: false, nuevo: true };
/** La ruta con seguimiento de esta app: el destino real (Google) lo guarda el estudio y lo resuelve `/resena/<slug>`. */
const ENLACE = '/resena/pilates-centro?o=app';

async function montar(page: Page, opts: { estado?: string; postExtra?: Record<string, unknown>; servidor?: { puedeValorar: boolean; motivo?: string | null; valoracion?: { puntuacion: number; comentario: string | null } | null } } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  (f.socia.reservas as unknown[]).push({ id: RESERVA_ID, sesionId: SESION_ID, socioId: SOCIO_ID, estado: opts.estado ?? 'ASISTIDA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null });
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  const peticiones: Peticion[] = [];
  let guardada = opts.servidor?.valoracion ?? null;
  await page.route('**/api/public/valorar-clase**', (r) => {
    const req = r.request();
    peticiones.push({ method: req.method(), auth: req.headers()['authorization'], body: req.method() === 'POST' ? req.postDataJSON() as Record<string, unknown> : null });
    if (req.method() === 'POST') {
      const b = req.postDataJSON() as { puntuacion: number; comentario: string | null };
      const actualizada = !!guardada;
      guardada = { puntuacion: b.puntuacion, comentario: b.comentario };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, actualizada, ...opts.postExtra }) });
    }
    const s = opts.servidor ?? { puedeValorar: true, motivo: null };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ puedeValorar: s.puedeValorar, motivo: s.motivo ?? null, valoracion: guardada }) });
  });
  return peticiones;
}

const tarjeta = (page: Page) => page.getByTestId('valorar-clase');

test.describe('Student PWA · valorar la clase', () => {
  test('asistida → estrellas; enviar manda nota y comentario y pasa a «Tu valoración»', async ({ page }) => {
    const peticiones = await montar(page);
    await page.goto(`${base}/mis-reservas/${RESERVA_ID}`);
    await expect(tarjeta(page)).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta(page).getByText(/¿qué tal la clase/i)).toBeVisible();

    await expect(page.getByRole('button', { name: /^enviar valoración$/i })).toBeDisabled();
    await tarjeta(page).getByRole('button', { name: '4 estrellas' }).click();
    await expect(tarjeta(page).getByText('Muy bien')).toBeVisible();
    await tarjeta(page).getByLabel('Comentario').fill('  Genial, muy atenta  ');
    await page.getByRole('button', { name: /^enviar valoración$/i }).click();

    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBe(1);
    const post = peticiones.find((p) => p.method === 'POST')!;
    expect(post.auth).toMatch(/^Bearer /);
    expect(post.body).toEqual({ studioId: STUDIO_ID, sesionId: SESION_ID, puntuacion: 4, comentario: 'Genial, muy atenta' });

    await expect(page.getByText(/gracias por tu valoración/i)).toBeVisible();
    await expect(tarjeta(page).getByText('Tu valoración')).toBeVisible();
    await expect(tarjeta(page).getByRole('img', { name: '4 de 5 estrellas' })).toBeVisible();
    await expect(tarjeta(page).getByText('«Genial, muy atenta»')).toBeVisible();
  });

  test('ya valorada → se enseña lo que puso y se puede cambiar', async ({ page }) => {
    const peticiones = await montar(page, { servidor: { puedeValorar: true, valoracion: { puntuacion: 3, comentario: null } } });
    await page.goto(`${base}/mis-reservas/${RESERVA_ID}`);
    await expect(tarjeta(page).getByText('Tu valoración')).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta(page).getByRole('img', { name: '3 de 5 estrellas' })).toBeVisible();
    await tarjeta(page).getByRole('button', { name: /cambiar mi valoración/i }).click();
    await tarjeta(page).getByRole('button', { name: '5 estrellas' }).click();
    await page.getByRole('button', { name: /^enviar valoración$/i }).click();
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBe(1);
    expect(peticiones.find((p) => p.method === 'POST')!.body).toMatchObject({ puntuacion: 5 });
    await expect(page.getByText(/valoración actualizada/i)).toBeVisible();
  });

  test('reserva confirmada (no asistida) → sin estrellas', async ({ page }) => {
    const peticiones = await montar(page, { estado: 'CONFIRMADA' });
    await page.goto(`${base}/mis-reservas/${RESERVA_ID}`);
    // La pantalla del detalle carga; la tarjeta de valorar no existe.
    await expect(page.getByRole('heading', { name: 'Tu reserva' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Reformer/).first()).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
    expect(peticiones).toHaveLength(0);
  });

  test('el servidor manda: si dice que no se puede, no hay estrellas aunque la app crea que sí', async ({ page }) => {
    await montar(page, { servidor: { puedeValorar: false, motivo: 'no-asistida' } });
    await page.goto(`${base}/mis-reservas/${RESERVA_ID}`);
    await expect(page.getByText(/Reformer/).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await expect(tarjeta(page)).toHaveCount(0);
  });

  // ── Reseñas con premio (21-nov-2026) ───────────────────────────────────────
  // El premio es por valorar EN Tentare y se da con cualquier nota; el enlace de
  // reseñas va a todas y no habla del premio. Ver lib/valoraciones/premio.ts.
  async function valorar(page: Page, estrellas: number) {
    await page.goto(`${base}/mis-reservas/${RESERVA_ID}`);
    await expect(tarjeta(page)).toBeVisible({ timeout: 30_000 });
    await tarjeta(page).getByRole('button', { name: `${estrellas} estrellas` }).click();
    await page.getByRole('button', { name: /^enviar valoración$/i }).click();
  }

  test('con enlace y premio: el botón de reseña va PRIMERO y es la acción principal; el agradecimiento, debajo', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { premio: PREMIO, enlaceResenas: ENLACE } });
    await valorar(page, 5);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);

    const premio = page.getByTestId('premio-codigo');
    await expect(premio).toContainText('Te regalamos 10 % de descuento', { timeout: 15_000 });
    await expect(premio).toContainText('GRACIAS-AB12CD');
    await expect(premio).toContainText('19 de diciembre de 2026');
    // Dónde se canjea, tal cual es: comprar un bono o un plan, o recepción. Nada de «clase suelta».
    await expect(premio).toContainText(/al comprar un bono o un plan/i);
    await expect(premio).not.toContainText(/clase suelta/i);

    const enlace = page.getByTestId('enlace-resenas');
    const boton = enlace.getByRole('link', { name: 'Dejar mi reseña' });
    await expect(boton).toHaveAttribute('href', ENLACE);
    await expect(boton).toHaveAttribute('target', '_blank');
    await expect(boton).toHaveAttribute('rel', /noopener/);
    await expect(boton).toHaveClass(/btn--primary/);
    // El enlace NO menciona el premio (si lo hiciera, estaría premiando la reseña pública).
    await expect(enlace).not.toContainText(/premio|regal|descuento|código/i);
    // Va ANTES que el agradecimiento: es lo que se quiere que haga.
    const [cajaEnlace, cajaPremio] = [await enlace.boundingBox(), await premio.boundingBox()];
    expect(cajaEnlace!.y).toBeLessThan(cajaPremio!.y);
  });

  test('una nota baja recibe el mismo premio y el mismo enlace: no se filtra por la nota', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { premio: PREMIO, enlaceResenas: ENLACE } });
    await valorar(page, 1);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    expect(peticiones.find((p) => p.method === 'POST')!.body).toMatchObject({ puntuacion: 1 });
    await expect(page.getByTestId('premio-codigo')).toContainText('GRACIAS-AB12CD', { timeout: 15_000 });
    await expect(page.getByTestId('enlace-resenas')).toBeVisible();
  });

  test('solo el enlace (el estudio no ofrece premio): sale el botón y ningún código', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { enlaceResenas: ENLACE } });
    await valorar(page, 4);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    await expect(page.getByTestId('enlace-resenas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('premio-codigo')).toHaveCount(0);
  });

  test('si aún no le toca (menos de 3 clases): solo el agradecimiento, sin botón de reseña', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { premio: PREMIO } });
    await valorar(page, 5);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    await expect(page.getByTestId('premio-codigo')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('enlace-resenas')).toHaveCount(0);
  });

  test('sin premio ni enlace: la valoración se da por buena y no sale nada de más', async ({ page }) => {
    const peticiones = await montar(page);
    await valorar(page, 4);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    await expect(page.getByText(/gracias por tu valoración/i)).toBeVisible();
    await expect(page.getByTestId('premio-valoracion')).toHaveCount(0);
  });

  test('una URL entera no se pinta como enlace: solo la ruta de esta app (no es una redirección abierta)', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { enlaceResenas: 'https://evil.example/resena/x' } });
    await valorar(page, 4);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    await expect(page.getByText(/gracias por tu valoración/i)).toBeVisible();
    await expect(page.getByTestId('enlace-resenas')).toHaveCount(0);
  });

  test('premio caducado o ya usado: lo dice y no enseña un código muerto', async ({ page }) => {
    const peticiones = await montar(page, { postExtra: { premio: { ...PREMIO, vigente: false, nuevo: false } } });
    await valorar(page, 4);
    await expect.poll(() => peticiones.filter((p) => p.method === 'POST').length).toBeGreaterThan(0);
    await expect(page.getByTestId('premio-caducado')).toContainText('caducó el 19 de diciembre de 2026', { timeout: 15_000 });
    await expect(page.getByTestId('premio-codigo')).toHaveCount(0);
  });
});
