import { test, expect, type Page } from '@playwright/test';
import { SLUG, sembrarSociaCompleta } from './socia-completa';

// «Borrar mi cuenta de Tentare» (App Store 5.1.1(v)) y «Cambiar de estudio»,
// en el Perfil de la app del estudio.
//
// Lo que importa: sin la palabra NO sale ninguna petición; un «no» del servidor
// NUNCA se lee como «borrada» (con contador: «no mintió» también es verdad de un
// botón que no intentó nada); y solo con un sí de verdad se cierra la sesión y se
// sale. «Cambiar de estudio» solo existe dentro de la app de iOS.

const base = `/portal/${SLUG}`;
const ETIQUETA = 'Escribe BORRAR para confirmar';
const CLAVE_ULTIMO = 'tentare-app-ultimo-estudio';

type Respuesta = { status: number; body: unknown };

async function mockBorrar(page: Page, respuestas: Respuesta[]) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route((u) => u.pathname === '/api/public/cuenta/borrar', (r) => {
    posts.push(r.request().postDataJSON() as Record<string, unknown>);
    const res = respuestas[Math.min(posts.length - 1, respuestas.length - 1)];
    return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) });
  });
  return posts;
}

/**
 * Al salir de la página se apunta si la sesión seguía guardada. ⚠️ Hace falta
 * porque el andamiaje vuelve a sembrar la sesión en CADA documento (su init
 * script), y la salida tras borrar es una navegación completa: sin esto, el
 * documento nuevo la tendría otra vez y no se podría saber si se cerró. Si se
 * cerró, el documento nuevo tampoco la siembra, como en la vida real.
 */
async function vigilarSalida(page: Page) {
  await page.addInitScript(() => {
    addEventListener('pagehide', () => {
      try { sessionStorage.setItem('e2e-sesion-al-salir', localStorage.getItem('sb-portal-auth') === null ? 'cerrada' : 'abierta'); } catch { /* nada */ }
    });
    try { if (sessionStorage.getItem('e2e-sesion-al-salir') === 'cerrada') localStorage.removeItem('sb-portal-auth'); } catch { /* nada */ }
  });
  return () => page.evaluate(() => sessionStorage.getItem('e2e-sesion-al-salir'));
}

async function abrirHoja(page: Page) {
  await page.goto(`${base}/perfil/privacidad`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Borrar mi cuenta de Tentare', exact: true }).click({ timeout: 30_000 });
  const hoja = page.getByRole('dialog', { name: '¿Borrar tu cuenta de Tentare?' });
  await expect(hoja).toBeVisible();
  return hoja;
}

test.describe('Student PWA · borrar mi cuenta de Tentare', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sin BORRAR no sale nada; el servidor dice que no (409 y 500) y NO dice «borrada»', async ({ page }) => {
    const and = await sembrarSociaCompleta(page);
    const posts = await mockBorrar(page, [
      { status: 409, body: { error: 'Esta cuenta también es del equipo de un estudio. Pide al estudio que te elimine del equipo y después podrás borrarla desde aquí.', codigo: 'equipo' } },
      { status: 500, body: { error: 'No hemos podido borrar tu cuenta. Inténtalo de nuevo en unos minutos.' } },
    ]);

    const hoja = await abrirHoja(page);
    await page.evaluate((k) => localStorage.setItem(k, 'otro-estudio'), CLAVE_ULTIMO);
    // En la web no hay «Cambiar de estudio»: cada estudio tiene su app.
    await expect(page.getByTestId('cambiar-de-estudio')).toHaveCount(0);

    // Lo que pasa de verdad, y la salida a la solicitud al estudio.
    await expect(hoja.getByText(/ya no podrás entrar con ella en ningún estudio/)).toBeVisible();
    await expect(hoja.getByText(/conserva tu ficha y lo que la ley le obliga a guardar/)).toBeVisible();
    await expect(hoja.getByText('Solicitar la eliminación de mis datos', { exact: false })).toBeVisible();

    const campo = hoja.getByLabel(ETIQUETA);
    const borrar = hoja.getByRole('button', { name: 'Borrar mi cuenta', exact: true });
    await expect(borrar).toBeDisabled();
    await campo.fill('BORRA');
    await expect(borrar).toBeDisabled();
    // ⚠️ `force`: la hoja aún sube justo tras `toBeVisible` (ver student-privacidad.spec.ts).
    await expect(borrar).toBeInViewport({ ratio: 1 });
    await borrar.click({ force: true });
    await page.waitForTimeout(800);
    expect(posts).toHaveLength(0);

    // Con la palabra (en minúsculas también vale) sí sale, y el 409 se enseña tal cual.
    await campo.fill('borrar');
    await expect(borrar).toBeEnabled();
    await borrar.click();
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
    expect(posts[0]).toEqual({ confirmacion: 'borrar' });
    await expect(hoja.getByRole('alert')).toHaveText(/elimine del equipo/);

    // Un 500 tampoco es «borrada».
    await borrar.click();
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(2);
    await expect(hoja.getByRole('alert')).toHaveText(/No hemos podido borrar tu cuenta/);

    await page.waitForTimeout(800);
    expect(posts.length).toBeGreaterThan(0);
    await expect(page.getByText(/se ha borrado/)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${base}/perfil/privacidad$`));
    // La sesión y el último estudio siguen ahí: no se ha cerrado nada.
    expect(await page.evaluate(() => localStorage.getItem('sb-portal-auth'))).not.toBeNull();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_ULTIMO)).toBe('otro-estudio');
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });

  test('un 200 sin «borrada: true» tampoco es borrada', async ({ page }) => {
    const and = await sembrarSociaCompleta(page);
    const posts = await mockBorrar(page, [{ status: 200, body: {} }]);
    const hoja = await abrirHoja(page);
    await hoja.getByLabel(ETIQUETA).fill('BORRAR');
    await hoja.getByRole('button', { name: 'Borrar mi cuenta', exact: true }).click();
    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
    await expect(hoja.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${base}/perfil/privacidad$`));
    expect(await page.evaluate(() => localStorage.getItem('sb-portal-auth'))).not.toBeNull();
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });

  test('borrada de verdad (web): cierra la sesión, olvida el último estudio y va al acceso del estudio', async ({ page }) => {
    const and = await sembrarSociaCompleta(page);
    const sesionAlSalir = await vigilarSalida(page);
    const posts = await mockBorrar(page, [{ status: 200, body: { borrada: true } }]);
    const hoja = await abrirHoja(page);
    await page.evaluate((k) => localStorage.setItem(k, 'otro-estudio'), CLAVE_ULTIMO);
    await hoja.getByLabel(ETIQUETA).fill('BORRAR');
    await hoja.getByRole('button', { name: 'Borrar mi cuenta', exact: true }).click();

    // Primero se le dice, y hasta que no lo lee no se cierra nada.
    const hecha = page.getByRole('dialog', { name: 'Tu cuenta de Tentare se ha borrado' });
    await expect(hecha).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => localStorage.getItem('sb-portal-auth'))).not.toBeNull();
    await hecha.getByRole('button', { name: 'Entendido', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${base}/acceso/login`), { timeout: 30_000 });
    expect(posts).toHaveLength(1);
    expect(await sesionAlSalir()).toBe('cerrada');
    expect(await page.evaluate(() => localStorage.getItem('sb-portal-auth'))).toBeNull();
    expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE_ULTIMO)).toBeNull();
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });
});

test.describe('App de iOS · cambiar de estudio y borrar la cuenta', () => {
  test.describe.configure({ timeout: 120_000 });

  // Lo que Capacitor mete en el WebView antes de cargar la página
  // (lib/nativo/plataforma.ts). ⚠️ Fijo, sin dejar que se reasigne: al cargar
  // cualquier plugin, `@capacitor/core` pone su propio `window.Capacitor` de web
  // (isNativePlatform → false) y la página dejaba de «estar en la app» a medias.
  // Los plugins siguen siendo los de web y fallan («not implemented on web»):
  // aquí solo se prueba lo que decide la web, no la carcasa.
  const comoAppNativa = (page: Page) => page.addInitScript(() => {
    const fijo: Record<string, unknown> = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    const resto: Record<string | symbol, unknown> = {};
    const puente = new Proxy(resto, {
      get: (_o, k) => (typeof k === 'string' && k in fijo ? fijo[k] : resto[k]),
      set: (_o, k, v) => { if (!(typeof k === 'string' && k in fijo)) resto[k] = v; return true; },
    });
    Object.defineProperty(window, 'Capacitor', { get: () => puente, set: () => {}, configurable: false });
  });

  test('«Cambiar de estudio» lleva a la lista de la entrada, con los iconos de sus estudios', async ({ page }) => {
    const and = await sembrarSociaCompleta(page);
    await comoAppNativa(page);
    let pedidas = 0;
    await page.route((u) => u.pathname === '/api/app/mis-estudios', (r) => {
      pedidas++;
      return r.fulfill({ json: { estudios: [
        { slug: SLUG, nombre: 'Estudio Alma', como: 'alumna', icono: '/icon-192.png' },
        { slug: 'otro-e2e', nombre: 'Otro estudio', como: 'alumna', icono: '/icon-192.png' },
      ] } });
    });

    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    const fila = page.getByTestId('cambiar-de-estudio');
    await expect(fila).toBeVisible({ timeout: 30_000 });
    await expect(fila).toHaveAttribute('href', '/app?elegir=1');
    await expect(fila.getByText('Sin cerrar sesión')).toBeVisible();
    await expect.poll(() => pedidas, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(fila.locator('img')).toHaveCount(2);
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });

  test('borrada de verdad en la app: vuelve a la entrada de Tentare', async ({ page }) => {
    await sembrarSociaCompleta(page);
    const sesionAlSalir = await vigilarSalida(page);
    await comoAppNativa(page);
    await page.route((u) => u.pathname === '/api/app/mis-estudios', (r) => r.fulfill({ json: { estudios: [] } }));
    const posts = await mockBorrar(page, [{ status: 200, body: { borrada: true } }]);
    const hoja = await abrirHoja(page);
    await hoja.getByLabel(ETIQUETA).fill('BORRAR');
    await hoja.getByRole('button', { name: 'Borrar mi cuenta', exact: true }).click();
    await page.getByRole('dialog', { name: 'Tu cuenta de Tentare se ha borrado' })
      .getByRole('button', { name: 'Entendido', exact: true }).click({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
    expect(posts).toHaveLength(1);
    expect(await sesionAlSalir()).toBe('cerrada');
  });
});
