import { test, expect, type Page, type Route } from '@playwright/test';
import { montar } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Contenido de tu app» v2 (decisiones 10–13 de «Mi app y mi web», tras MI_WEB_NUEVA):
//   · tarjetas con su estado, su orden y un editor con nombre en cada cosa;
//   · una tarjeta nueva no lleva a ningún sitio; las pantallas de su app, por su nombre;
//   · el mensaje destacado se guarda con su botón (ahora sí lo ven) y la vista lo enseña;
//   · los avisos de antes se ofrecen como «Pasar a mensaje destacado», sin guardar solos;
//   · sin el interruptor, la pantalla de siempre.
//
// ⚠️ Donde se escribe, un contador de peticiones: «no mintió» sin contar puede ser
// verdad por no haber intentado nada. Mocks propios DESPUÉS del andamiaje.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
// Un día fijo: los estados de fechas («hasta el 25 oct», «Sale desde el 1 nov») no pueden depender del CI.
const AHORA = new Date('2026-10-15T12:00:00+02:00');
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const FOTO = 'https://fotos.example.com/clase.jpg';

const banner = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, imagen_url: FOTO, titulo, texto: null,
  link_tipo: 'interno', link_valor: '/reservar', ubicacion: ['home'], activo: true, orden: 0,
  fecha_inicio: null, fecha_fin: null, ...extra,
});

interface Cuenta { patches: Record<string, unknown>[]; posts: Record<string, unknown>[]; mensajes: Record<string, unknown>[] }

async function abrir(page: Page, opts: {
  banners?: Record<string, unknown>[];
  avisos?: Record<string, unknown>[];
  mensaje?: string | null;
  miWebNueva?: boolean;
  patch?: (r: Route, n: number) => Promise<void> | void;
  post?: (r: Route, n: number) => Promise<void> | void;
  guardarMensaje?: (r: Route, n: number) => Promise<void> | void;
} = {}): Promise<Cuenta> {
  await page.clock.setFixedTime(AHORA);
  await montar(page);
  const c: Cuenta = { patches: [], posts: [], mensajes: [] };
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true, miWebNueva: opts.miWebNueva ?? true }));
  await page.route('**/fotos.example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/rest/v1/contenido_portal_banners**', async (r) => {
    const m = r.request().method();
    if (m === 'PATCH') { c.patches.push(JSON.parse(r.request().postData() ?? '{}')); return opts.patch ? opts.patch(r, c.patches.length) : r.fulfill({ status: 204, body: '' }); }
    if (m === 'POST') { c.posts.push(JSON.parse(r.request().postData() ?? '{}')); return opts.post ? opts.post(r, c.posts.length) : r.fulfill({ status: 201, body: '' }); }
    return json(r, opts.banners ?? []);
  });
  await page.route('**/rest/v1/novedades_estudio**', (r) => json(r, opts.avisos ?? []));
  await page.route((u) => u.pathname === '/rest/v1/contenido_portal', async (r) => {
    if (r.request().method() === 'POST') {
      c.mensajes.push(JSON.parse(r.request().postData() ?? '{}'));
      return opts.guardarMensaje ? opts.guardarMensaje(r, c.mensajes.length) : r.fulfill({ status: 201, body: '' });
    }
    return json(r, opts.mensaje ? { studio_id: STUDIO_ID, mensaje_destacado: opts.mensaje } : null);
  });
  await page.goto('/configuracion?tab=descubre', { waitUntil: 'domcontentloaded' });
  return c;
}

const v2 = (page: Page) => page.getByTestId('contenido-de-tu-app-v2');
const vista = (page: Page) => page.getByTestId('vista-app-movil');

test('sin tarjetas, un vacío que enseña; la primera nace oculta, sin foto y sin llevar a ningún sitio, y se abre', async ({ page }) => {
  const c = await abrir(page);
  await expect(page.getByTestId('tarjetas-vacio')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Pon tarjetas en el inicio de su app' })).toBeVisible();
  await expect(vista(page)).toContainText('Aquí saldrán tus tarjetas');

  await page.getByRole('button', { name: 'Crear mi primera tarjeta' }).click();
  await expect(page.getByTestId('editor-tarjeta')).toBeVisible({ timeout: 15_000 });
  expect(c.posts).toHaveLength(1);
  expect(c.posts[0]).toMatchObject({ link_tipo: 'ninguno', link_valor: '', activo: false, imagen_url: '', titulo: null });
  await expect(page.getByRole('heading', { name: 'Nueva tarjeta' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ningún sitio' })).toHaveAttribute('aria-checked', 'true');
  // Sin foto no se deja publicar, y se dice.
  await expect(page.getByRole('switch', { name: 'Que la vean en su app' })).toBeDisabled();
  await expect(page.getByText('Ponle una foto para poder publicarla: sin foto no sale.')).toBeVisible();
  // La vista la enseña como solo suya.
  await expect(vista(page)).toContainText('Solo la ves tú');
});

test('si crear falla, lo dice en rojo y no abre nada', async ({ page }) => {
  const c = await abrir(page, { post: (r) => json(r, { message: 'fallo' }, 500) });
  await page.getByRole('button', { name: 'Crear mi primera tarjeta' }).click();
  await expect(v2(page).getByRole('alert')).toBeVisible({ timeout: 15_000 });
  expect(c.posts.length).toBeGreaterThan(0);
  await expect(page.getByTestId('editor-tarjeta')).toHaveCount(0);
});

test('la lista dice de cada tarjeta si sale y por qué, y el orden se cambia con subir y bajar', async ({ page }) => {
  const c = await abrir(page, {
    banners: [
      banner('b-1', 'Taller de suelo pélvico', { orden: 0, fecha_fin: '2026-10-25' }),
      banner('b-2', 'Nuevo horario de sábados', { orden: 1, fecha_inicio: '2026-11-01' }),
      banner('b-3', 'Síguenos en Instagram', { orden: 2, imagen_url: '', link_tipo: 'externo', link_valor: 'https://instagram.com/estudio' }),
      banner('b-4', 'Bono de verano', { orden: 3, activo: false, link_tipo: 'ninguno', link_valor: '' }),
    ],
  });
  const filas = page.getByTestId('fila-tarjeta');
  await expect(filas).toHaveCount(4, { timeout: 60_000 });
  await expect(filas.nth(0)).toContainText('Se ve en la app · hasta el 25 oct');
  await expect(filas.nth(0)).toContainText('Lleva a: Reservar clase');
  await expect(filas.nth(1)).toContainText('Sale desde el 1 nov');
  await expect(filas.nth(2)).toContainText('Sin foto: no sale');
  await expect(filas.nth(2)).toContainText('Lleva a: instagram.com/estudio');
  await expect(filas.nth(3)).toContainText('Oculta');
  await expect(filas.nth(3)).toContainText('No lleva a ningún sitio');
  await expect(page.getByRole('button', { name: 'Tarjetas · 4' })).toBeVisible();
  // En su app solo sale la primera.
  await expect(vista(page)).toContainText('Taller de suelo pélvico');
  await expect(vista(page)).not.toContainText('Nuevo horario de sábados');

  await page.getByRole('button', { name: 'Bajar «Taller de suelo pélvico»' }).click();
  await expect(filas.nth(0)).toContainText('Nuevo horario de sábados', { timeout: 15_000 });
  expect(c.patches.length).toBeGreaterThan(0);
  expect(c.patches).toEqual([{ orden: 0 }, { orden: 1 }]);
  await expect(page.getByRole('button', { name: 'Subir «Nuevo horario de sábados»' })).toBeDisabled();
});

test('«Al tocarla, lleva a»: una pantalla por su nombre, una web solo entera, o ningún sitio', async ({ page }) => {
  const c = await abrir(page, { banners: [banner('b-1', 'Taller', { link_tipo: 'ninguno', link_valor: '' })] });
  await page.getByTestId('fila-tarjeta').getByRole('button', { name: /^Taller/ }).click();
  await expect(page.getByTestId('editor-tarjeta')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('radio', { name: 'Una pantalla de su app' }).click();
  await expect.poll(() => c.patches.at(-1)).toEqual({ link_tipo: 'interno', link_valor: '/reservar' });
  await page.getByLabel('Pantalla de su app').selectOption({ label: 'Comprar bonos y cuotas (la tienda)' });
  await expect.poll(() => c.patches.at(-1)).toEqual({ link_tipo: 'interno', link_valor: '/comprar' });

  await page.getByRole('radio', { name: 'Una web' }).click();
  // Sin escribirla todavía, no lleva a ningún sitio: no se queda apuntando a la pantalla de antes.
  await expect.poll(() => c.patches.at(-1)).toEqual({ link_tipo: 'ninguno', link_valor: '' });
  const antes = c.patches.length;
  await page.getByLabel('Dirección web').fill('instagram.com/estudio');
  await expect(page.getByText('Escríbela entera, empezando por https://. Hasta entonces no se guarda.')).toBeVisible();
  await page.waitForTimeout(1200);
  expect(c.patches.length, 'una web a medias no se guarda').toBe(antes);
  await page.getByLabel('Dirección web').fill('https://instagram.com/estudio');
  await expect.poll(() => c.patches.at(-1), { timeout: 10_000 }).toEqual({ link_tipo: 'externo', link_valor: 'https://instagram.com/estudio' });
  await expect(page.getByTestId('estado-guardado')).toContainText('Guardado');
});

test('un fallo al guardar la tarjeta se dice, nunca «Guardado», y «Listo» no se va', async ({ page }) => {
  const c = await abrir(page, { banners: [banner('b-1', 'Taller')], patch: (r) => json(r, { message: 'fallo' }, 500) });
  await page.getByTestId('fila-tarjeta').getByRole('button', { name: /^Taller/ }).click();
  await page.getByLabel('Título').fill('Taller de suelo pélvico');
  await expect(page.getByTestId('estado-guardado')).toContainText('No se ha guardado', { timeout: 15_000 });
  expect(c.patches.length).toBeGreaterThan(0);
  await expect(v2(page).getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('editor-tarjeta')).toBeVisible();
});

test('el mensaje se ve en su app mientras se escribe, se guarda con su botón y nunca solo', async ({ page }) => {
  const c = await abrir(page);
  await page.getByRole('button', { name: 'Mensaje destacado' }).click();
  const texto = page.getByLabel('Mensaje destacado');
  await texto.fill('Cerramos el 1 de noviembre.');
  await expect(vista(page).getByTestId('vista-franja')).toContainText('Cerramos el 1 de noviembre.');
  await page.waitForTimeout(1200);
  expect(c.mensajes, 'el mensaje no se guarda solo: lo leen todas sus alumnas').toHaveLength(0);

  await page.getByRole('button', { name: 'Guardar el mensaje' }).click();
  await expect(page.getByRole('button', { name: 'Guardado' })).toBeVisible({ timeout: 15_000 });
  expect(c.mensajes).toHaveLength(1);
  expect(c.mensajes[0]).toMatchObject({ studio_id: STUDIO_ID, mensaje_destacado: 'Cerramos el 1 de noviembre.' });
});

test('si guardar el mensaje falla, lo dice y no dice «Guardado»', async ({ page }) => {
  const c = await abrir(page, { guardarMensaje: (r) => json(r, { message: 'fallo' }, 500) });
  await page.getByRole('button', { name: 'Mensaje destacado' }).click();
  await page.getByLabel('Mensaje destacado').fill('Cerramos el 1 de noviembre.');
  await page.getByRole('button', { name: 'Guardar el mensaje' }).click();
  await expect(v2(page).getByRole('alert')).toBeVisible({ timeout: 15_000 });
  expect(c.mensajes.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Guardado' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar el mensaje' })).toBeEnabled();
});

test('los avisos de antes se pasan a mensaje destacado sin guardarse solos, y no se borra ninguno', async ({ page }) => {
  const c = await abrir(page, {
    mensaje: 'Bienvenidas',
    avisos: [{ id: 'nov-1', studio_id: STUDIO_ID, titulo: 'Cerramos el 1 de noviembre', texto: 'Festivo: no hay clases.', emoji: null, activo: true, fecha_inicio: null, fecha_fin: null, created_at: '2026-10-01T10:00:00Z' }],
  });
  await page.getByRole('button', { name: 'Mensaje destacado' }).click();
  await expect(page.getByRole('heading', { name: 'Avisos que escribiste antes' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Mensaje destacado')).toHaveValue('Bienvenidas');
  await page.getByRole('button', { name: 'Pasar a mensaje destacado' }).click();
  await expect(page.getByLabel('Mensaje destacado')).toHaveValue('Cerramos el 1 de noviembre. Festivo: no hay clases.');
  await expect(page.getByText('Lo tienes aquí: revísalo y guárdalo para que salga en su app.')).toBeVisible();
  expect(c.mensajes).toHaveLength(0);
  await page.getByRole('button', { name: 'Guardar el mensaje' }).click();
  await expect.poll(() => c.mensajes.at(-1)).toMatchObject({ mensaje_destacado: 'Cerramos el 1 de noviembre. Festivo: no hay clases.' });
  // Nada aquí se llama «tablón» (ese es el de Comunidad) y no hay forma de añadir avisos.
  await expect(v2(page).getByText(/tablón/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Añadir aviso/ })).toHaveCount(0);
});

test('en el móvil la vista va en una hoja, con su botón', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page, { banners: [banner('b-1', 'Taller')] });
  await expect(page.getByTestId('fila-tarjeta')).toHaveCount(1, { timeout: 60_000 });
  // A la derecha no cabe: la de la rejilla va oculta.
  await expect(v2(page).getByTestId('vista-app-movil')).toBeHidden();
  await page.getByRole('button', { name: 'Ver cómo queda en su app' }).click();
  const hoja = page.getByRole('dialog', { name: 'Así lo ven tus alumnas' });
  await expect(hoja).toBeVisible();
  await expect(hoja.getByTestId('vista-app-movil')).toBeVisible();
  await expect(hoja.getByTestId('vista-app-movil')).toContainText('Taller');
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(desborde).toBeLessThanOrEqual(0);
});

test('sin MI_WEB_NUEVA, la pantalla de siempre', async ({ page }) => {
  await abrir(page, { miWebNueva: false });
  await expect(page.getByRole('button', { name: 'Añadir banner' })).toBeVisible({ timeout: 60_000 });
  await expect(v2(page)).toHaveCount(0);
});
