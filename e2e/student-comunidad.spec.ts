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
    { id: 'p-txt', texto: 'Esta semana estrenamos la sala nueva. ¡Venid a verla!', imagenUrl: null, autorNombre: 'Estudio Alma', autorInicial: 'E', creadoEn: '2026-08-11T10:00:00Z', likes: 3, likedByMe: false, comentariosCount: 0, tipo: 'TEXTO', eventoFecha: null, eventoAforo: null, eventoLugar: null },
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

    // `likedByMe: false` en el mock → corazón vacío: esta socia no lo ha dado
    // ella, aunque otras 3 personas sí (P2, antes el corazón era un contador
    // estático siempre relleno — ahora distingue "cuántos" de "yo también").
    const like = post(page, 'p-txt').getByRole('button', { name: 'Me gusta' });
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await expect(like).toHaveText('3');
    await expect(post(page, 'p-ev').getByText('3 de 10 plazas')).toBeVisible();
    await expect(post(page, 'p-ev').getByRole('button', { name: 'Me apunto' })).toBeVisible();
    // Completo: sin botón de RSVP, y se dice. (P2: like/comentar viven en
    // TODO post ahora — la ausencia que importa aquí es la de "Me
    // apunto"/"Ya no voy", no la de cualquier botón de la tarjeta.)
    await expect(post(page, 'p-lleno').getByText(/Completo/)).toBeVisible();
    await expect(post(page, 'p-lleno').getByRole('button', { name: /Me apunto|Ya no voy/ })).toHaveCount(0);
    // Pasado: sin botón de RSVP aunque estuviera apuntada.
    await expect(post(page, 'p-pasado').getByText(/Ya celebrado/)).toBeVisible();
    await expect(post(page, 'p-pasado').getByRole('button', { name: /Me apunto|Ya no voy/ })).toHaveCount(0);
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

  test('comentar la primera vez pide las normas; al aceptarlas, el comentario se publica', async ({ page }) => {
    await montar(page);
    const cuenta = { envios: 0, aceptar: 0 };
    let aceptadas = false;
    const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
    await page.route((u) => u.pathname === '/api/public/normas-comunidad', (r) => { cuenta.aceptar++; aceptadas = true; return r.fulfill(json({ aceptadas: true })); });
    await page.route((u) => u.pathname === '/api/public/comunidad/comentarios', (r) => {
      if (r.request().method() === 'GET') return r.fulfill(json({ comentarios: [] }));
      cuenta.envios++;
      if (!aceptadas) return r.fulfill(json({ error: 'Antes de escribir, acepta las normas de la comunidad.', codigo: 'NORMAS_PENDIENTES' }, 409));
      return r.fulfill(json({ comentario: { id: 'c1', postId: 'p-txt', autorNombre: 'Ana T.', autorInicial: 'AT', texto: '¡Qué bonita!', creadoEn: new Date().toISOString(), esMio: true } }));
    });
    await page.goto(`${base}/comunidad`);
    const tarjeta = post(page, 'p-txt');
    await tarjeta.getByRole('button', { name: 'Comentar' }).click({ timeout: 30_000 });
    await tarjeta.getByPlaceholder('Escribe un comentario…').fill('¡Qué bonita!');
    await tarjeta.getByRole('button', { name: 'Enviar' }).click();
    const hoja = page.getByTestId('hoja-normas');
    await expect(hoja).toBeInViewport({ timeout: 15_000 });
    await hoja.getByRole('button', { name: 'Acepto las normas' }).click();
    // El mismo comentario, repetido una sola vez tras aceptar; publicado, el cuadro se vacía.
    await expect.poll(() => cuenta.envios, { timeout: 15_000 }).toBe(2);
    await expect(tarjeta.getByPlaceholder('Escribe un comentario…')).toHaveValue('', { timeout: 15_000 });
    await expect(tarjeta.locator('p', { hasText: '¡Qué bonita!' })).toHaveCount(1);
    expect(cuenta).toEqual({ envios: 2, aceptar: 1 });
  });

  test('una publicación fijada por el estudio lleva la marca «Fijado»', async ({ page }) => {
    const [txt, ...resto] = posts();
    await montar(page, { posts: [{ ...txt, fijado: true }, ...resto] });
    await page.goto(`${base}/comunidad`);
    await expect(post(page, 'p-txt').getByTestId('post-fijado')).toHaveText('Fijado', { timeout: 30_000 });
    await expect(page.getByTestId('post-fijado')).toHaveCount(1);
  });

  test('sin publicaciones → estado vacío honesto', async ({ page }) => {
    await montar(page, { posts: [] });
    await page.goto(`${base}/comunidad`);
    await expect(page.getByText(/aún no hay publicaciones/i)).toBeVisible({ timeout: 30_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Borrar lo tuyo, denunciar y bloquear en el tablón (App Store 1.2). Cada camino
// lleva su contador de peticiones: «no pasó nada» sería verdad también si la
// pantalla no hubiera pedido nada.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Student PWA · comentarios del tablón: borrar, denunciar y bloquear', () => {
  const MIO = { id: 'c-mio', postId: 'p-txt', autorNombre: 'Ana T.', autorInicial: 'AT', texto: 'Me encanta la sala', creadoEn: '2026-08-11T11:00:00Z', esMio: true, deAlumna: true };
  const DE_OTRA = { id: 'c-otra', postId: 'p-txt', autorNombre: 'Marta R.', autorInicial: 'MR', texto: 'Comentario feo', creadoEn: '2026-08-11T12:00:00Z', esMio: false, deAlumna: true };
  const DEL_ESTUDIO = { id: 'c-est', postId: 'p-txt', autorNombre: 'Estudio Alma', autorInicial: 'E', texto: '¡Gracias a todas!', creadoEn: '2026-08-11T13:00:00Z', esMio: false, deAlumna: false };

  async function montarComentarios(page: Page, o: { falla?: boolean } = {}) {
    await montar(page, { posts: [{ ...posts()[0], comentariosCount: 3 }] });
    const llamadas: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
    let lista = [MIO, DE_OTRA, DEL_ESTUDIO];
    let lecturas = 0;
    const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
    // Registradas DESPUÉS del arnés: Playwright prueba las rutas de la última a la primera.
    await page.route((u) => u.pathname === '/api/public/comunidad/comentarios', (r) => {
      lecturas++;
      return r.fulfill(json({ comentarios: lista }));
    });
    await page.route((u) => u.pathname.startsWith('/api/public/comunidad/comentarios/'), (r) => {
      const req = r.request();
      const ruta = new URL(req.url()).pathname.replace('/api/public/comunidad/comentarios/', '');
      llamadas.push({ metodo: req.method(), ruta, cuerpo: req.postDataJSON() });
      if (o.falla) return r.fulfill(json({ error: 'No se ha podido enviar la denuncia. Inténtalo otra vez.' }, 500));
      if (ruta === 'c-mio' && req.method() === 'DELETE') lista = lista.filter((c) => c.id !== 'c-mio');
      if (ruta === 'c-otra/bloquear') lista = lista.filter((c) => c.id !== 'c-otra');
      return r.fulfill(json(ruta.endsWith('/denunciar') ? { ok: true, mensaje: 'Gracias. Lo revisaremos.' } : { ok: true }));
    });
    await page.goto(`${base}/comunidad`);
    const tarjeta = post(page, 'p-txt');
    await tarjeta.getByRole('button', { name: /comentarios/ }).click({ timeout: 30_000 });
    await expect(tarjeta.getByTestId('comentario')).toHaveCount(3, { timeout: 15_000 });
    return { tarjeta, llamadas, lecturas: () => lecturas };
  }

  test('el suyo se borra, con confirmación', async ({ page }) => {
    const { tarjeta, llamadas } = await montarComentarios(page);
    await tarjeta.getByRole('button', { name: 'Opciones de tu comentario' }).click();
    await expect(page.getByRole('button', { name: 'Denunciar este comentario' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Borrar mi comentario' }).click();
    expect(llamadas).toHaveLength(0);
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(tarjeta.getByTestId('comentario')).toHaveCount(2, { timeout: 15_000 });
    expect(llamadas).toEqual([{ metodo: 'DELETE', ruta: 'c-mio', cuerpo: { studioId: STUDIO_ID } }]);
  });

  test('el de otra se denuncia y da las gracias', async ({ page }) => {
    const { tarjeta, llamadas } = await montarComentarios(page);
    await tarjeta.getByTestId('comentario').filter({ hasText: 'Comentario feo' }).click();
    await page.getByRole('button', { name: 'Denunciar este comentario' }).click();
    await expect(page.getByText('Gracias. Lo revisaremos.')).toBeVisible({ timeout: 15_000 });
    expect(llamadas).toEqual([{ metodo: 'POST', ruta: 'c-otra/denunciar', cuerpo: { studioId: STUDIO_ID } }]);
  });

  test('si la denuncia no llega, lo dice y no da las gracias', async ({ page }) => {
    const { tarjeta, llamadas } = await montarComentarios(page, { falla: true });
    await tarjeta.getByTestId('comentario').filter({ hasText: 'Comentario feo' }).click();
    await page.getByRole('button', { name: 'Denunciar este comentario' }).click();
    await expect(page.getByText('No se ha podido enviar la denuncia')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Gracias. Lo revisaremos.')).toHaveCount(0);
    expect(llamadas.length).toBeGreaterThan(0);
  });

  test('a una compañera se la bloquea con confirmación y su comentario deja de verse', async ({ page }) => {
    const { tarjeta, llamadas, lecturas } = await montarComentarios(page);
    await tarjeta.getByTestId('comentario').filter({ hasText: 'Comentario feo' }).click();
    await page.getByRole('button', { name: 'Bloquear a Marta R.' }).click();
    await expect(page.getByRole('heading', { name: '¿Bloquear a Marta R.?' })).toBeVisible();
    expect(llamadas).toHaveLength(0);
    await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
    await expect(tarjeta.getByTestId('comentario').filter({ hasText: 'Comentario feo' })).toHaveCount(0, { timeout: 15_000 });
    expect(llamadas).toEqual([{ metodo: 'POST', ruta: 'c-otra/bloquear', cuerpo: { studioId: STUDIO_ID } }]);
    // Lo que se ve después lo dice el servidor: se releyó el hilo.
    expect(lecturas()).toBe(2);
  });

  test('al estudio no se le bloquea: su comentario solo se denuncia', async ({ page }) => {
    const { tarjeta } = await montarComentarios(page);
    await tarjeta.getByTestId('comentario').filter({ hasText: '¡Gracias a todas!' }).click();
    await expect(page.getByRole('button', { name: 'Denunciar este comentario' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bloquear/ })).toHaveCount(0);
  });
});
