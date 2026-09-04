import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, sembrarSociaLista } from './socia-lista';

// El tablón del estudio en la Student PWA.
//
// El feed y el RSVP de eventos ya existían en el servidor (audiencia, aforo,
// 409 si está completo); faltaba la pantalla. Lo que rompe a una alumna: un
// «Me apunto» que se pinta apuntado sin que el servidor lo haya aceptado, o
// un botón vivo en un evento ya completo o ya celebrado.

const base = `/portal/${SLUG}`;

function posts() {
  return [
    { id: 'p-txt', texto: 'Esta semana estrenamos la sala nueva. ¡Venid a verla!', imagenUrl: null, autorNombre: 'Estudio Alma', autorInicial: 'E', creadoEn: '2026-08-11T10:00:00Z', likes: 3, comentariosCount: 0, tipo: 'TEXTO', eventoFecha: null, eventoAforo: null, eventoLugar: null },
    { id: 'p-ev', texto: 'Masterclass de respiración.', imagenUrl: null, autorNombre: 'Ana', autorInicial: 'A', creadoEn: '2026-08-10T10:00:00Z', likes: 0, comentariosCount: 0, tipo: 'EVENTO', eventoFecha: '2026-08-20T18:00:00Z', eventoAforo: 10, eventoLugar: 'Sala 1', totalAsistentes: 3, apuntada: false },
    { id: 'p-lleno', texto: 'Taller de suelo pélvico.', imagenUrl: null, autorNombre: 'Ana', autorInicial: 'A', creadoEn: '2026-08-09T10:00:00Z', likes: 0, comentariosCount: 0, tipo: 'EVENTO', eventoFecha: '2026-08-21T18:00:00Z', eventoAforo: 5, eventoLugar: 'Sala 2', totalAsistentes: 5, apuntada: false },
    { id: 'p-pasado', texto: 'Brunch de junio.', imagenUrl: null, autorNombre: 'Ana', autorInicial: 'A', creadoEn: '2026-06-01T10:00:00Z', likes: 8, comentariosCount: 0, tipo: 'EVENTO', eventoFecha: '2026-06-15T11:00:00Z', eventoAforo: null, eventoLugar: null, totalAsistentes: 12, apuntada: true },
  ];
}

interface Peticion { method: string; url: string; auth: string | undefined; body: Record<string, unknown> | null }

async function montar(page: Page, opts: { posts?: unknown[]; rsvp?: number } = {}) {
  await sembrarSociaLista(page);
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  // Predicado, no glob: en Playwright `?` es comodín de UN carácter, así que
  // `posts?**` no casa con `posts?studioId=…` y el mock no se aplicaba.
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: opts.posts ?? posts() }) }));
  const peticiones: Peticion[] = [];
  await page.route('**/api/public/comunidad/posts/*/asistentes', (r) => {
    const req = r.request();
    peticiones.push({ method: req.method(), url: req.url(), auth: req.headers()['authorization'], body: req.postDataJSON() as Record<string, unknown> });
    const status = opts.rsvp ?? 200;
    if (status !== 200) return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'Este evento ya está completo' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ apuntada: req.method() === 'POST', totalAsistentes: req.method() === 'POST' ? 4 : 3 }) });
  });
  return peticiones;
}

const post = (page: Page, id: string) => page.locator(`[data-testid=post]`).filter({ hasText: id === 'p-txt' ? 'sala nueva' : id === 'p-ev' ? 'Masterclass' : id === 'p-lleno' ? 'suelo pélvico' : 'Brunch' });

test.describe('Student PWA · comunidad', () => {
  test('pinta texto y eventos; solo el evento futuro con hueco ofrece «Me apunto»', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comunidad`);
    await expect(page.getByRole('heading', { name: 'Comunidad' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid=post]')).toHaveCount(4);

    await expect(post(page, 'p-txt').getByText('♥ 3')).toBeVisible();
    await expect(post(page, 'p-ev').getByText('3 de 10 plazas')).toBeVisible();
    await expect(post(page, 'p-ev').getByRole('button', { name: 'Me apunto' })).toBeVisible();
    // Completo: sin botón, y se dice.
    await expect(post(page, 'p-lleno').getByText(/Completo/)).toBeVisible();
    await expect(post(page, 'p-lleno').getByRole('button')).toHaveCount(0);
    // Pasado: sin botón aunque estuviera apuntada.
    await expect(post(page, 'p-pasado').getByText(/Ya celebrado/)).toBeVisible();
    await expect(post(page, 'p-pasado').getByRole('button')).toHaveCount(0);
  });

  test('«Me apunto» manda el estudio al servidor y actualiza plazas; «Ya no voy» hace DELETE', async ({ page }) => {
    const peticiones = await montar(page);
    await page.goto(`${base}/comunidad`);
    const boton = post(page, 'p-ev').getByRole('button', { name: 'Me apunto' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();

    await expect.poll(() => peticiones.length).toBe(1);
    expect(peticiones[0].method).toBe('POST');
    expect(peticiones[0].url).toMatch(/\/api\/public\/comunidad\/posts\/p-ev\/asistentes$/);
    expect(peticiones[0].auth).toMatch(/^Bearer /);
    expect(peticiones[0].body).toEqual({ studioId: STUDIO_ID });
    await expect(post(page, 'p-ev').getByText('4 de 10 plazas')).toBeVisible();
    await expect(page.getByText(/te esperamos/i)).toBeVisible();

    await post(page, 'p-ev').getByRole('button', { name: 'Ya no voy' }).click();
    await expect.poll(() => peticiones.length).toBe(2);
    expect(peticiones[1].method).toBe('DELETE');
    await expect(post(page, 'p-ev').getByText('3 de 10 plazas')).toBeVisible();
  });

  test('si el servidor dice que no (409 completo), se deshace y se avisa', async ({ page }) => {
    await montar(page, { rsvp: 409 });
    await page.goto(`${base}/comunidad`);
    const boton = post(page, 'p-ev').getByRole('button', { name: 'Me apunto' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();
    await expect(page.getByText(/ya está completo/i)).toBeVisible();
    await expect(post(page, 'p-ev').getByText('3 de 10 plazas')).toBeVisible();
    await expect(post(page, 'p-ev').getByRole('button', { name: 'Me apunto' })).toBeVisible();
  });

  test('sin publicaciones → estado vacío honesto', async ({ page }) => {
    await montar(page, { posts: [] });
    await page.goto(`${base}/comunidad`);
    await expect(page.getByText(/aún no hay publicaciones/i)).toBeVisible({ timeout: 30_000 });
  });
});
