import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Etiquetas de alumnas (Configuración → Alta de alumnas → Etiquetas; migr 20261110120000).
//
// Antes una etiqueta era un texto suelto en la ficha (siete fijas) y no había forma de crear una propia ni de renombrar,
// juntar o quitar una de todas las alumnas a la vez. Lo que se fija aquí, contra el panel sembrado:
//   · la fila dice cuántas etiquetas hay, juntando el catálogo y lo que ya está puesto en las fichas;
//   · crear una manda estudio, nombre y color, y aparece en la lista;
//   · renombrar dice ANTES a cuántas alumnas toca, y solo cambia la lista cuando el servidor dice que sí;
//   · eliminar pide confirmación diciendo a cuántas se les quita;
//   · si el servidor dice que no, la lista se queda como estaba y se dice por qué.
//
// ⚠️ Un test de camino de fallo sin contador de peticiones es hueco: cada «el servidor dice no» comprueba que se INTENTÓ.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

interface Rastro { creadas: Record<string, unknown>[]; renombradas: Record<string, unknown>[]; eliminadas: Record<string, unknown>[]; colores: Record<string, unknown>[] }

async function abrir(page: Page, opts: { renombrar?: 'ok' | 'no'; eliminar?: 'ok' | 'no'; crear?: 'ok' | 'repetida' } = {}) {
  const rastro: Rastro = { creadas: [], renombradas: [], eliminadas: [], colores: [] };
  const catalogo = [{ id: 'e-vip', nombre: 'VIP', color: 'rosa' }];
  await montar(page);
  // El catálogo y sus operaciones (el resto de `rest/v1` ya está sembrado por `montar`).
  await page.route('**/rest/v1/etiquetas**', async (r) => {
    const m = r.request().method();
    if (m === 'GET') return json(r, catalogo);
    if (m === 'POST') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      rastro.creadas.push(cuerpo);
      if (opts.crear === 'repetida') return json(r, { code: '23505', message: 'duplicate key value violates unique constraint "etiquetas_nombre_unico"' }, 409);
      return json(r, { id: `e-${rastro.creadas.length}`, nombre: cuerpo.nombre, color: cuerpo.color }, 201);
    }
    if (m === 'PATCH') { rastro.colores.push(r.request().postDataJSON() as Record<string, unknown>); return r.fulfill({ status: 204 }); }
    return r.fulfill({ status: 204 });
  });
  await page.route('**/rest/v1/rpc/etiqueta_renombrar', async (r) => {
    rastro.renombradas.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.renombrar === 'no') return json(r, { code: '42501', message: 'No tienes permiso para cambiar etiquetas' }, 403);
    return json(r, 1);
  });
  await page.route('**/rest/v1/rpc/etiqueta_eliminar', async (r) => {
    rastro.eliminadas.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.eliminar === 'no') return json(r, { code: '42501', message: 'No tienes permiso para cambiar etiquetas' }, 403);
    return json(r, 1);
  });
  await ir(page, 'configuracion?tab=altas');
  return rastro;
}

const valor = (page: Page) => page.locator('#etiquetas [data-resumen]');
const cajon = (page: Page) => page.getByRole('dialog').first();
const lista = (page: Page) => cajon(page).locator('li');
const fila = (page: Page, nombre: string) => lista(page).filter({ hasText: nombre });
// El diálogo de confirmar es un segundo `dialog` encima del cajón.
const confirmar = (page: Page) => page.getByRole('dialog').filter({ hasText: /¿Eliminar/ });

async function abrirCajon(page: Page) {
  await expect(valor(page)).toHaveText(/etiquetas?$/, { timeout: 30_000 });
  await page.locator('#etiquetas').click();
  await expect(cajon(page).getByRole('heading', { level: 2, name: 'Etiquetas', exact: true })).toBeVisible();
}

test.describe('Etiquetas de alumnas', () => {
  test('desde la ficha se crea una etiqueta propia y se le pone a la alumna, con lo que contesta el servidor', async ({ page }) => {
    test.setTimeout(150_000); // la ficha compila bajo demanda en `next dev` la primera vez
    const rastro = await abrir(page);
    const fichas: Record<string, unknown>[] = [];
    // El PATCH de la ficha (las etiquetas se guardan en `socios.tags`); lo demás sigue con el panel sembrado.
    await page.route('**/rest/v1/socios**', async (r) => {
      if (r.request().method() !== 'PATCH') return r.fallback();
      fichas.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 204 });
    });
    await ir(page, 'clientas/soc-1');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    const dialogo = page.getByRole('dialog').filter({ hasText: 'Añadir etiqueta' });
    // Se ofrece la del catálogo (VIP) y las sugeridas de serie que el estudio aún no tiene, no las que ya lleva.
    await expect(dialogo.getByRole('button', { name: 'VIP', exact: true })).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Lesión', exact: true })).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'reformer', exact: true })).toHaveCount(0);
    await dialogo.getByLabel('Nombre de la etiqueta nueva').fill('Mamás');
    await dialogo.getByRole('radio', { name: 'Verde' }).click();
    await dialogo.getByRole('button', { name: 'Crear y poner' }).click();
    await expect(page.getByRole('button', { name: 'Quitar la etiqueta Mamás' })).toBeVisible();
    expect(rastro.creadas).toHaveLength(1);
    expect(rastro.creadas[0]).toMatchObject({ nombre: 'Mamás', color: 'verde' });
    expect(fichas.length, 'se guardó en la ficha').toBeGreaterThan(0);
    expect(fichas[0].tags).toEqual(['reformer', 'Mamás']);
  });

  test('la fila junta el catálogo y las etiquetas que ya están en las fichas', async ({ page }) => {
    await abrir(page);
    // VIP (catálogo) + «reformer» y «nueva» (puestas en las fichas sembradas, sin catálogo).
    await expect(valor(page)).toHaveText('3 etiquetas', { timeout: 30_000 });
    await abrirCajon(page);
    await expect(lista(page)).toHaveCount(3);
    await expect(fila(page, 'VIP')).toContainText('Sin alumnas');
    await expect(fila(page, 'reformer')).toContainText('1 alumna');
  });

  test('crear una etiqueta manda su estudio, nombre y color, y aparece en la lista', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByLabel('Nombre de la etiqueta').fill('  Mamás  ');
    await cajon(page).getByRole('radio', { name: 'Verde' }).first().click();
    await cajon(page).getByRole('button', { name: 'Añadir etiqueta' }).click();
    await expect(fila(page, 'Mamás')).toBeVisible();
    expect(rastro.creadas).toHaveLength(1);
    expect(rastro.creadas[0]).toMatchObject({ nombre: 'Mamás', color: 'verde' });
    expect(typeof rastro.creadas[0].studio_id).toBe('string');
    await expect(valor(page)).toHaveText('4 etiquetas');
  });

  test('un nombre repetido (sin distinguir mayúsculas) se avisa sin llamar al servidor', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByLabel('Nombre de la etiqueta').fill('vip');
    await cajon(page).getByRole('button', { name: 'Añadir etiqueta' }).click();
    await expect(cajon(page).getByRole('alert')).toHaveText('Ya hay una etiqueta con ese nombre.');
    expect(rastro.creadas, 'no debería haber llegado al servidor').toHaveLength(0);
  });

  test('si el servidor dice que ya existe, se dice y no aparece dos veces', async ({ page }) => {
    const rastro = await abrir(page, { crear: 'repetida' });
    await abrirCajon(page);
    await cajon(page).getByLabel('Nombre de la etiqueta').fill('Mañanas');
    await cajon(page).getByRole('button', { name: 'Añadir etiqueta' }).click();
    await expect(cajon(page).getByRole('alert')).toHaveText('Ya hay una etiqueta con ese nombre.');
    expect(rastro.creadas.length, 'se intentó crearla').toBeGreaterThan(0);
    await expect(fila(page, 'Mañanas')).toHaveCount(0);
  });

  test('renombrar dice antes a cuántas alumnas toca y cambia la lista al confirmar el servidor', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Renombrar reformer' }).click();
    await cajon(page).getByLabel('Nuevo nombre').fill('Reformer');
    await expect(cajon(page).getByRole('status')).toHaveText('Se cambiará en 1 alumna.');
    await cajon(page).getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(fila(page, 'Reformer')).toBeVisible();
    await expect(fila(page, 'reformer')).toHaveCount(1); // la misma fila, ya con su nuevo nombre
    expect(rastro.renombradas).toEqual([{ p_viejo: 'reformer', p_nuevo: 'Reformer' }]);
  });

  test('renombrar a una que ya existe las junta, y lo dice antes', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Renombrar reformer' }).click();
    await cajon(page).getByLabel('Nuevo nombre').fill('vip');
    await expect(cajon(page).getByRole('status')).toContainText('Ya existe «vip»: las dos se juntan');
    await cajon(page).getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(lista(page)).toHaveCount(2);
    expect(rastro.renombradas).toEqual([{ p_viejo: 'reformer', p_nuevo: 'vip' }]);
    await expect(fila(page, 'VIP')).toContainText('1 alumna');
  });

  test('si el servidor dice que no, renombrar deja la lista como estaba y se dice por qué', async ({ page }) => {
    const rastro = await abrir(page, { renombrar: 'no' });
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Renombrar reformer' }).click();
    await cajon(page).getByLabel('Nuevo nombre').fill('Reformer');
    await cajon(page).getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(cajon(page).getByRole('alert')).toBeVisible();
    expect(rastro.renombradas.length, 'se intentó renombrar').toBeGreaterThan(0);
    await expect(fila(page, 'reformer')).toHaveCount(1);
    await expect(cajon(page).getByRole('button', { name: 'Renombrar Reformer', exact: true })).toHaveCount(0);
  });

  test('eliminar pide confirmación diciendo a cuántas alumnas se les quita', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Eliminar nueva' }).click();
    await expect(confirmar(page)).toContainText('Se quita de 1 alumna');
    await confirmar(page).getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(fila(page, 'nueva')).toHaveCount(0);
    expect(rastro.eliminadas).toEqual([{ p_nombre: 'nueva' }]);
    await expect(valor(page)).toHaveText('2 etiquetas');
  });

  test('si el servidor dice que no, eliminar deja la etiqueta en su sitio', async ({ page }) => {
    const rastro = await abrir(page, { eliminar: 'no' });
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Eliminar nueva' }).click();
    await confirmar(page).getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect.poll(() => rastro.eliminadas.length, 'se intentó eliminar').toBeGreaterThan(0);
    await expect(fila(page, 'nueva')).toHaveCount(1);
  });

  test('darle color a una etiqueta que solo está en fichas la mete en el catálogo', async ({ page }) => {
    const rastro = await abrir(page);
    await abrirCajon(page);
    await cajon(page).getByRole('button', { name: 'Cambiar el color de nueva' }).click();
    await cajon(page).getByRole('radiogroup', { name: 'Color de nueva' }).getByRole('radio', { name: 'Violeta' }).click();
    await expect.poll(() => rastro.creadas.length).toBe(1);
    expect(rastro.creadas[0]).toMatchObject({ nombre: 'nueva', color: 'violeta' });
  });

  test('la fila de Etiquetas es una sola y no desborda la pantalla', async ({ page }) => {
    await abrir(page);
    await expect(page.locator('#etiquetas')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
