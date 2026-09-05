import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Favoritas en la Student PWA.
//
// El backend existía entero (`favoritos_clase`, `POST /api/public/favoritos`
// con la socia derivada del JWT); faltaba la pantalla. Lo que rompe a una
// alumna: un corazón que se pinta marcado sin que el servidor lo haya
// guardado, o una píldora «Favoritas» que aparece sin tener ninguna.

const base = `/portal/${SLUG}`;

interface Peticion { auth: string | undefined; body: Record<string, unknown> }

async function montar(page: Page, opts: { favoritas?: string[]; respuesta?: number } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  // Un segundo tipo de clase, para que la píldora tenga algo que dejar fuera.
  f.tiposClase.push({ id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null });
  f.sesiones.push({ ...f.sesiones[0], id: 'ses-11', tipoClaseId: 'tc-m', inicio: '2026-08-12T12:00:00', fin: '2026-08-12T12:50:00' });
  const socia = f.socia as typeof f.socia & { favoritos?: unknown[] };
  socia.favoritos = (opts.favoritas ?? []).map((t) => ({ id: `fav-${t}`, studioId: STUDIO_ID, socioId: SOCIO_ID, tipoClaseId: t, creadoEn: '2026-08-01T00:00:00Z' }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  const peticiones: Peticion[] = [];
  await page.route('**/api/public/favoritos', (r) => {
    peticiones.push({ auth: r.request().headers()['authorization'], body: r.request().postDataJSON() as Record<string, unknown> });
    const status = opts.respuesta ?? 200;
    return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true } : { error: 'boom' }) });
  });
  return peticiones;
}

const corazon = (page: Page) => page.getByTestId('favorito');

test.describe('Student PWA · favoritas', () => {
  test('el corazón marca: manda el tipo de clase al servidor y queda marcado', async ({ page }) => {
    const peticiones = await montar(page);
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });

    await corazon(page).click();
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0].auth).toMatch(/^Bearer /);
    // Lo que se guarda es el TIPO (Reformer), no la sesión: así lo modela la tabla.
    expect(peticiones[0].body).toEqual({ studioId: STUDIO_ID, tipoClaseId: 'tc-r', accion: 'marcar' });
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/guardada en tus favoritas/i)).toBeVisible();
  });

  test('si el servidor no lo guarda, el corazón vuelve a estar sin marcar', async ({ page }) => {
    await montar(page, { respuesta: 500 });
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await corazon(page).click();
    await expect(page.getByText(/no hemos podido guardar el favorito/i)).toBeVisible();
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('ya favorita → el corazón sale marcado y quitarla manda «desmarcar»', async ({ page }) => {
    const peticiones = await montar(page, { favoritas: ['tc-r'] });
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await corazon(page).click();
    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0].body).toMatchObject({ tipoClaseId: 'tc-r', accion: 'desmarcar' });
    await expect(corazon(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('horario: la píldora «Favoritas» solo existe con favoritas, y filtra', async ({ page }) => {
    await montar(page, { favoritas: ['tc-r'] });
    await page.goto(`${base}/reservar`);
    const pildora = page.getByRole('button', { name: 'Favoritas' });
    await expect(pildora).toBeVisible({ timeout: 30_000 });
    // Las dos clases del día antes de filtrar…
    await expect(page.getByRole('link', { name: /Reformer/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Mat/ }).first()).toBeVisible();
    await pildora.click();
    await expect(pildora).toHaveAttribute('aria-pressed', 'true');
    // …y solo la favorita después.
    await expect(page.getByRole('link', { name: /Reformer/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Mat/ })).toHaveCount(0);
  });

  test('horario: sin favoritas no hay píldora', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/reservar`);
    await expect(page.getByRole('button', { name: 'Con hueco' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Favoritas' })).toHaveCount(0);
  });
});
