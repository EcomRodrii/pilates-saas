import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, sembrarSociaLista } from './socia-lista';

// Las preguntas del estudio («Datos extra de la ficha») antes de usar la app.
//
// Un estudio las había creado y, probando como alumna, no le salían nunca. Con
// «Preguntar los datos extra en su app» encendido, la app no la deja reservar ni
// comprar hasta contestarlas; apagado (lo de serie) no cambia nada.
//
// El interruptor lo resuelve el SERVIDOR (`lib/studio-seo.ts`), así que
// `page.route` no llega: en e2e está encendido para el slug `tentare-preguntas`
// y apagado para el resto. Cada «no se hizo» lleva su contador de intentos.

const CON = '/portal/tentare-preguntas';
const SIN = `/portal/${SLUG}`;

const OBJETIVO = { id: 'cp-objetivo', etiqueta: '¿Cuál es tu objetivo?', tipo: 'seleccion', opciones: ['Fuerza', 'Flexibilidad', 'Rehabilitación'], requerido: true };
const COMO = { id: 'cp-como', etiqueta: '¿Cómo nos conociste?', tipo: 'texto', opciones: [], requerido: false };
const PRACTICO = { id: 'cp-practico', etiqueta: '¿Has practicado Pilates antes?', tipo: 'booleano', opciones: [], requerido: true };
const PREGUNTAS = [OBJETIVO, COMO, PRACTICO];

const estado = (pendientes: string[], respuestas: Record<string, unknown> = {}) =>
  ({ activa: true, preguntas: PREGUNTAS, pendientes, respuestas });

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

/**
 * La sesión CON ficha. ⚠️ El `**\/api/public/session` del andamiaje no casa con la
 * URL real (lleva `?slug=`), así que ahí la alumna queda sin ficha y la app
 * enseña Inicio igual. Aquí la ficha importa: sin ella no hay nadie a quien
 * preguntar, y el test pasaría sin mirar nada.
 */
async function conFicha(page: Page) {
  await page.route((u) => u.pathname === '/api/public/session', (r) =>
    r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' })));
}

async function montar(page: Page, opts: {
  get?: unknown;
  post?: { status?: number; body: unknown };
} = {}) {
  await sembrarSociaLista(page);
  await conFicha(page);
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [] })));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill(json({ posts: [] })));

  const lecturas: string[] = [];
  const envios: Record<string, unknown>[] = [];
  // Registrada DESPUÉS del andamiaje: Playwright resuelve en orden inverso.
  await page.route((u) => u.pathname === '/api/public/preguntas-alta', (r) => {
    if (r.request().method() === 'GET') {
      lecturas.push(r.request().url());
      return r.fulfill(json(opts.get ?? estado(PREGUNTAS.map(p => p.id))));
    }
    envios.push(JSON.parse(r.request().postData() ?? '{}'));
    const p = opts.post ?? { body: estado([], { 'cp-objetivo': 'Fuerza', 'cp-como': null, 'cp-practico': false }) };
    return r.fulfill(json(p.body, p.status ?? 200));
  });
  return { lecturas, envios };
}

const home = (page: Page) => page.getByText(/¿qué te apetece hoy\?/i);

test.describe('Student PWA · preguntas del estudio antes de empezar', () => {
  // ⚠️ Sin service worker. En el build de producción (el del CI) la app registra
  // `/sw.js`, y en WebKit una página ya controlada por él manda sus `fetch` a
  // través del worker: `page.route` no los ve y la reserva llegaba al servidor
  // de verdad (401 «tu sesión ha caducado»). En `next dev` no hay worker, por
  // eso pasaba en local. Esto no cambia nada de lo que se prueba.
  test.use({ serviceWorkers: 'block' });
  test('encendido: la app le pone las preguntas delante, valida y, al guardar, la deja pasar', async ({ page }) => {
    const { envios } = await montar(page);
    await page.goto(CON);

    const form = page.getByTestId('preguntas-alta');
    await expect(form.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible({ timeout: 30_000 });
    await expect(home(page)).toHaveCount(0);
    await expect(form.getByText('(opcional)')).toHaveCount(1);

    // Sin contestar las obligatorias no se manda nada: las marca.
    await form.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(form.getByText('Esta pregunta es obligatoria.')).toHaveCount(2);
    expect(envios).toHaveLength(0);

    await form.getByRole('button', { name: 'Fuerza' }).click();
    await expect(form.getByRole('button', { name: 'Fuerza' })).toHaveAttribute('aria-pressed', 'true');
    await form.getByRole('button', { name: 'No', exact: true }).click();
    await form.getByLabel(/¿Cómo nos conociste\?/).fill('Por Instagram');
    await form.getByRole('button', { name: 'Guardar y continuar' }).click();

    await expect(home(page)).toBeVisible({ timeout: 30_000 });
    expect(envios).toHaveLength(1);
    // «No» viaja como `false`, que es una respuesta, no como vacío.
    expect(envios[0]).toEqual({
      studioId: STUDIO_ID,
      respuestas: { 'cp-objetivo': 'Fuerza', 'cp-como': 'Por Instagram', 'cp-practico': false },
    });
  });

  test('si el servidor dice que no, se queda en las preguntas y enseña por qué', async ({ page }) => {
    const { envios } = await montar(page, {
      post: { status: 400, body: { error: 'Revisa las respuestas marcadas.', errores: { 'cp-objetivo': 'Elige una de las opciones.' } } },
    });
    await page.goto(CON);
    const form = page.getByTestId('preguntas-alta');
    await form.getByRole('button', { name: 'Flexibilidad' }).click({ timeout: 30_000 });
    await form.getByRole('button', { name: 'Sí', exact: true }).click();
    await form.getByRole('button', { name: 'Guardar y continuar' }).click();

    await expect(form.getByText('Elige una de las opciones.')).toBeVisible({ timeout: 30_000 });
    await expect(form.getByText('Revisa las respuestas marcadas.')).toBeVisible();
    expect(envios.length).toBeGreaterThan(0);
    await expect(home(page)).toHaveCount(0);
  });

  test('solo le pregunta lo que le falta, con lo que ya tenía puesto', async ({ page }) => {
    await montar(page, { get: estado(['cp-practico'], { 'cp-objetivo': 'Fuerza', 'cp-como': null }) });
    await page.goto(CON);
    const form = page.getByTestId('preguntas-alta');
    await expect(form.getByText('¿Has practicado Pilates antes?')).toBeVisible({ timeout: 30_000 });
    await expect(form.getByText('¿Cuál es tu objetivo?')).toHaveCount(0);
    await expect(form.getByText('¿Cómo nos conociste?')).toHaveCount(0);
  });

  test('ya lo contestó todo: entra directa, sin preguntas', async ({ page }) => {
    const { lecturas } = await montar(page, { get: estado([], { 'cp-objetivo': 'Fuerza', 'cp-como': null, 'cp-practico': true }) });
    await page.goto(CON);
    await expect(home(page)).toBeVisible({ timeout: 30_000 });
    expect(lecturas.length).toBeGreaterThan(0);
    await expect(page.getByTestId('preguntas-alta')).toHaveCount(0);
  });

  test('si no se pueden cargar las preguntas, no se queda atascada (el servidor sigue cerrando reservar)', async ({ page }) => {
    await sembrarSociaLista(page);
    await conFicha(page);
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [] })));
    await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill(json({ posts: [] })));
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/public/preguntas-alta', (r) => { intentos++; return r.fulfill(json({ error: 'boom' }, 500)); });
    await page.goto(CON);
    await expect(home(page)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
  });

  test('apagado (lo de serie): ni se pregunta al servidor', async ({ page }) => {
    const { lecturas } = await montar(page);
    await page.goto(SIN);
    await expect(home(page)).toBeVisible({ timeout: 30_000 });
    expect(lecturas).toHaveLength(0);
    await expect(page.getByTestId('preguntas-alta')).toHaveCount(0);
  });

  test('si el estudio las enciende con la app abierta, reservar le abre las preguntas en vez de un error', async ({ page }) => {
    const { lecturas } = await montar(page);
    let reservas = 0;
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      reservas++;
      return r.fulfill(json({ error: 'Antes de reservar tienes que contestar unas preguntas del estudio.', codigo: 'faltan-preguntas' }, 409));
    });

    // Slug con el interruptor APAGADO: la app no ha preguntado nada al entrar.
    await page.goto(`${SIN}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /reservar/i }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^confirmar/i }).click({ timeout: 30_000 });

    await expect(page.getByTestId('preguntas-alta').getByRole('heading', { name: 'Antes de empezar' })).toBeVisible({ timeout: 30_000 });
    expect(reservas).toBeGreaterThan(0);
    expect(lecturas.length).toBeGreaterThan(0);
  });
});
