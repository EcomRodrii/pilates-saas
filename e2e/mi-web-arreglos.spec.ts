import { test, expect, type Page, type Route } from '@playwright/test';
import { montar } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi app y mi web»: los arreglos que van sí o sí (15-oct-2026), sin cambiar el aspecto.
//
// Contenido de tu app:
//   · escribir deprisa en un banner no se come letras (el campo enseña lo tecleado y
//     se guarda al dejar de escribir), y «Guardado» solo con el servidor diciendo que sí;
//   · «Añadir banner / aviso» abre lo que acaba de crear;
//   · el interruptor dice qué hace, y sin foto no se deja publicar (la app no lo enseñaría);
//   · los textos dicen la verdad: el mensaje destacado y estos avisos hoy no salen en su app.
// Widgets:
//   · con la página oculta, se dice que los widgets también lo están;
//   · la vista previa pegajosa se queda DEBAJO de la barra de arriba.
//
// ⚠️ Donde se escribe, un contador de peticiones: «no mintió» sin contar puede ser
// verdad por no haber intentado nada. Mocks propios DESPUÉS del andamiaje.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const banner = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, imagen_url: 'https://fotos.example.com/clase.jpg', titulo, texto: null,
  link_tipo: 'interno', link_valor: '/bonos', ubicacion: ['home'], activo: true, orden: 0,
  fecha_inicio: null, fecha_fin: null, ...extra,
});

type Escrituras = { patches: Record<string, unknown>[]; posts: Record<string, unknown>[] };

async function abrirContenido(page: Page, opts: {
  banners?: Record<string, unknown>[];
  patch?: (r: Route, n: number) => Promise<void> | void;
  post?: (r: Route, n: number) => Promise<void> | void;
} = {}): Promise<Escrituras> {
  await montar(page);
  const e: Escrituras = { patches: [], posts: [] };
  await page.route('**/fotos.example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  for (const tabla of ['contenido_portal_banners', 'novedades_estudio']) {
    await page.route(`**/rest/v1/${tabla}**`, async (r) => {
      const m = r.request().method();
      if (m === 'PATCH') {
        e.patches.push(JSON.parse(r.request().postData() ?? '{}'));
        return opts.patch ? opts.patch(r, e.patches.length) : r.fulfill({ status: 204, body: '' });
      }
      if (m === 'POST') {
        e.posts.push(JSON.parse(r.request().postData() ?? '{}'));
        return opts.post ? opts.post(r, e.posts.length) : r.fulfill({ status: 201, body: '' });
      }
      return json(r, tabla === 'contenido_portal_banners' ? (opts.banners ?? []) : []);
    });
  }
  await page.goto('/configuracion?tab=descubre', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Añadir banner' })).toBeVisible({ timeout: 60_000 });
  return e;
}

// ─── Contenido de tu app ────────────────────────────────────────────────────

test('escribir deprisa en un banner no se come letras, sale en pocas escrituras y dice «Guardado» al final', async ({ page }) => {
  // El servidor tarda: era justo cuando el campo volvía al valor viejo y la tecla siguiente se perdía.
  const e = await abrirContenido(page, {
    banners: [banner('b-1', 'Clase de prueba')],
    patch: async (r) => { await new Promise((ok) => setTimeout(ok, 400)); await r.fulfill({ status: 204, body: '' }); },
  });
  await page.getByRole('button', { name: /Clase de prueba/ }).click();
  // Por su texto de ejemplo, que también tenía el editor de antes: así este test se puede
  // pasar contra el código viejo y ver que falla por las letras, no por no encontrar el campo.
  const titulo = page.getByPlaceholder('Título del banner');
  await titulo.fill('');
  await titulo.pressSequentially('Bono de bienvenida', { delay: 15 });
  await expect(titulo).toHaveValue('Bono de bienvenida');
  await expect(page.getByTestId('estado-guardado')).toHaveText('Guardado', { timeout: 15_000 });
  await expect(titulo).toHaveValue('Bono de bienvenida');

  expect(e.patches.length).toBeGreaterThan(0);
  expect(e.patches.length, 'se agrupan: no una escritura por tecla').toBeLessThan(5);
  expect(e.patches.at(-1)).toEqual({ titulo: 'Bono de bienvenida' });
});

test('si no se puede guardar, lo dice en rojo, nunca «Guardado», y «Reintentar» lo manda otra vez', async ({ page }) => {
  let falla = true;
  const e = await abrirContenido(page, {
    banners: [banner('b-1', 'Clase de prueba')],
    patch: (r) => (falla ? json(r, { message: 'fallo' }, 500) : r.fulfill({ status: 204, body: '' })),
  });
  await page.getByRole('button', { name: /Clase de prueba/ }).click();
  await page.getByLabel('Texto corto').pressSequentially('Ven a probar', { delay: 15 });

  await expect(page.getByTestId('estado-guardado')).toContainText('No se ha guardado.', { timeout: 15_000 });
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.getByTestId('estado-guardado')).not.toHaveText('Guardado');
  const intentos = e.patches.length;
  expect(intentos).toBeGreaterThan(0);
  // Lo tecleado no se pierde aunque no se haya guardado.
  await expect(page.getByLabel('Texto corto')).toHaveValue('Ven a probar');

  falla = false;
  await page.getByTestId('estado-guardado').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByTestId('estado-guardado')).toHaveText('Guardado', { timeout: 15_000 });
  expect(e.patches.length).toBeGreaterThan(intentos);
  expect(e.patches.at(-1)).toEqual({ texto: 'Ven a probar' });
});

test('«Añadir banner» y «Añadir aviso» abren lo que acaban de crear, y un banner sin foto no se deja publicar', async ({ page }) => {
  const e = await abrirContenido(page);
  await page.getByRole('button', { name: 'Añadir banner' }).click();
  await expect(page.getByLabel('Título del banner')).toHaveValue('Nuevo banner', { timeout: 15_000 });
  expect(e.posts).toHaveLength(1);
  // Sin foto: el interruptor dice qué hace y por qué no se puede.
  const publicar = page.getByRole('switch', { name: 'Publicar en su app' });
  await expect(publicar).toBeDisabled();
  await expect(page.getByText('Ponle una foto para poder publicarlo')).toBeVisible();

  await page.getByRole('button', { name: 'Añadir aviso' }).click();
  await expect(page.getByLabel('Título del aviso')).toHaveValue('Nuevo aviso', { timeout: 15_000 });
  expect(e.posts).toHaveLength(2);
  await expect(page.getByText(/hoy su app no enseña estos avisos/)).toBeVisible();
});

test('si falla crear el banner, no se abre nada y se dice en rojo (con contador)', async ({ page }) => {
  const e = await abrirContenido(page, { post: (r) => r.abort('failed') });
  await page.getByRole('button', { name: 'Añadir banner' }).click();
  await expect.poll(() => e.posts.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.getByLabel('Título del banner')).toHaveCount(0);
});

test('un banner publicado sin foto se dice en la lista y en su ficha, y la fila no lo cuenta', async ({ page }) => {
  await abrirContenido(page, { banners: [banner('b-1', 'Con foto'), banner('b-2', 'Sin foto', { imagen_url: '' })] });
  await expect(page.getByRole('button', { name: /Sin foto: no sale/ })).toBeVisible();
  await page.getByRole('button', { name: /^Sin foto/ }).click();
  await expect(page.getByText('Publicado, pero sin foto no sale en su app')).toBeVisible();
  // Se deja apagar (estaba publicado), aunque no encender.
  await expect(page.getByRole('switch', { name: 'Publicar en su app' })).toBeEnabled();

  // El mensaje destacado dice la verdad: hoy no sale.
  await page.getByRole('button', { name: 'Mensaje destacado' }).click();
  await expect(page.getByText('Hoy su app no enseña el mensaje destacado')).toBeVisible();

  // La fila de la sección cuenta lo que sale en su app: la de la foto, no la otra.
  await page.goto('/configuracion?tab=web', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('1 tarjeta en su app')).toBeVisible({ timeout: 60_000 });
});

// ─── Widgets ────────────────────────────────────────────────────────────────

async function abrirWidgets(page: Page, opts: { oculta: boolean | null; panelNuevo?: boolean }) {
  await montar(page);
  const lecturas: string[] = [];
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: opts.panelNuevo ?? true }));
  // La web ya contestada: abre directamente los pasos, con la vista previa.
  await page.route('**/rest/v1/studios**', (r) => (r.request().method() === 'PATCH'
    ? json(r, [{ id: STUDIO_ID }])
    : json(r, {
      id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
      email: 'cloe@example.com', moneda: 'EUR', widget_builder: { _web: { plataforma: 'wordpress' } },
    })));
  await page.route((u) => u.pathname === '/api/pagina-publica', (r) => {
    lecturas.push(r.request().method());
    return opts.oculta === null ? json(r, { error: 'no' }, 500) : json(r, { oculta: opts.oculta, tieneClave: false });
  });
  await page.goto('/configuracion?tab=web&abrir=widgets', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Así lo verá tu alumna' })).toBeVisible({ timeout: 60_000 });
  return lecturas;
}

test('con la página oculta, Widgets dice que los widgets también lo están; visible o sin respuesta, no dice nada', async ({ page }) => {
  const lecturas = await abrirWidgets(page, { oculta: true });
  const aviso = page.getByTestId('aviso-pagina-oculta');
  await expect(aviso).toBeVisible({ timeout: 15_000 });
  await expect(aviso).toContainText('Tu página está oculta');
  await expect(aviso).toContainText('«Estamos preparando esta página»');
  await expect(aviso.getByRole('link', { name: 'Cambiarlo' })).toHaveAttribute('href', /tab=web.*#pagina-publica|pagina-publica/);
  expect(lecturas.length).toBeGreaterThan(0);
});

for (const oculta of [false, null] as const) {
  test(`Widgets sin aviso de página oculta cuando ${oculta === null ? 'no se puede leer' : 'está visible'}`, async ({ page }) => {
    const lecturas = await abrirWidgets(page, { oculta });
    await expect.poll(() => lecturas.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('aviso-pagina-oculta')).toHaveCount(0);
  });
}

for (const panelNuevo of [true, false]) {
  test(`al bajar, la vista previa se queda pegada DEBAJO de la barra de arriba, no detrás (${panelNuevo ? 'panel nuevo' : 'panel de antes'})`, async ({ page }) => {
    await abrirWidgets(page, { oculta: false, panelNuevo });
    const barra = page.locator('[data-panel-topbar]');
    await expect(barra).toBeVisible();
    const cabecera = page.getByRole('heading', { name: 'Así lo verá tu alumna' });
    // Bajar lo bastante para que la vista previa tenga que pegarse.
    await page.mouse.move(400, 600);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 8_000 }).toBeGreaterThan(300);
    // Se mide la caja que se pega, no el título: en el panel nuevo el título va dentro de
    // un fondo de color y quedaba fuera de la barra aunque la caja pasara por debajo.
    await expect.poll(async () => {
      const abajoBarra = await barra.evaluate((el) => el.getBoundingClientRect().bottom);
      const arribaCaja = await cabecera.evaluate((el) => {
        let p: HTMLElement | null = el;
        while (p && getComputedStyle(p).position !== 'sticky') p = p.parentElement;
        return p ? p.getBoundingClientRect().top : Number.NaN;
      });
      return arribaCaja >= abajoBarra;
    }, { message: 'la vista previa pegada empieza por debajo de la barra', timeout: 8_000 }).toBe(true);
    // Y lo que hay en el sitio del título es el título, no la barra.
    const destapado = await cabecera.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const encima = document.elementFromPoint(r.left + 10, r.top + r.height / 2);
      return !!encima && (el === encima || el.contains(encima));
    });
    expect(destapado).toBe(true);
  });
}
