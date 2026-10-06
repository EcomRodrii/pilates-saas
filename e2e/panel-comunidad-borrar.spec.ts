import { test, expect, type Page, type Route } from '@playwright/test';
import { ir, montar } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Panel › Comunidad › «Borrar» una publicación.
//
// Desde 20261006014416 el navegador ya no borra la fila por PostgREST: lo hace
// `DELETE /api/comunidad/posts/[id]`, que borra también la foto del bucket
// público. Aquí se prueba la pantalla:
//   1. un borrado bueno pide ESA ruta (una vez) y la publicación desaparece;
//   2–4. si el servidor dice que no (502, 403) o se cae la red, la publicación
//        vuelve a su sitio y se avisa.
//
// ⚠️ Cada camino de fallo lleva su contador de intentos: «la publicación sigue
// ahí» sería verdad también si la pantalla no hubiera llegado a pedir nada
// (tentare-os.md, punto ciego (1)). Y se cuenta el borrado por PostgREST, que
// tiene que seguir en cero: es justo el camino que ya no existe.
// ─────────────────────────────────────────────────────────────────────────────

const TEXTO = 'Mañana cerramos a las 14:00 por formación del equipo.';

const POST = {
  id: 'post-1', studio_id: 'studio-test', autor_id: 'auth-e2e-duena', autor_nombre: 'Cloe', autor_inicial: 'C',
  texto: TEXTO, likes: 0, comentarios_count: 0, fijado: false, creado_en: new Date(Date.now() - 3_600_000).toISOString(),
  audiencia: 'TODAS', imagen_url: null, tipo: 'TEXTO', evento_fecha: null, evento_aforo: null, evento_lugar: null,
};

type Respuesta = 'ok' | 'falla' | 'prohibido' | 'cae';

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function montarConPost(page: Page, respuesta: Respuesta) {
  const intentos = { ruta: 0, postgrest: 0 };
  await montar(page);
  // Registradas DESPUÉS del andamiaje: Playwright prueba las rutas de la última a la primera.
  await page.route('**/rest/v1/posts_comunidad**', (r) => {
    if (r.request().method() === 'DELETE') {
      intentos.postgrest++;
      return json(r, [], 200);
    }
    return json(r, [POST]);
  });
  await page.route((u) => u.pathname === '/api/comunidad/posts/post-1', (r) => {
    if (r.request().method() !== 'DELETE') return r.fallback();
    intentos.ruta++;
    if (respuesta === 'ok') return r.fulfill({ status: 204 });
    if (respuesta === 'falla') return json(r, { error: 'No se ha podido borrar la publicación. Inténtalo otra vez.' }, 502);
    if (respuesta === 'prohibido') return json(r, { error: 'No tienes permiso para borrar esta publicación.' }, 403);
    return r.abort('failed');
  });
  return intentos;
}

async function borrar(page: Page) {
  await ir(page, 'comunidad');
  await expect(page.getByText(TEXTO)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Borrar publicación' }).click();
  await page.getByRole('button', { name: 'Borrar', exact: true }).click();
}

test.describe('Panel · Comunidad · borrar una publicación', () => {
  test.describe.configure({ timeout: 120_000 });

  test('borra por la ruta del servidor, una vez, y la publicación desaparece', async ({ page }) => {
    const intentos = await montarConPost(page, 'ok');
    await borrar(page);
    await expect(page.getByText(TEXTO)).toHaveCount(0, { timeout: 15_000 });
    expect(intentos.ruta).toBe(1);
    expect(intentos.postgrest).toBe(0);
  });

  test('si el servidor no puede (502), la publicación vuelve y se avisa', async ({ page }) => {
    const intentos = await montarConPost(page, 'falla');
    await borrar(page);
    await expect(page.getByText('No se ha podido borrar la publicación. Inténtalo otra vez.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEXTO)).toBeVisible();
    expect(intentos.ruta).toBeGreaterThan(0);
    expect(intentos.postgrest).toBe(0);
  });

  test('si el servidor dice que no le toca (403), la publicación vuelve', async ({ page }) => {
    const intentos = await montarConPost(page, 'prohibido');
    await borrar(page);
    await expect.poll(() => intentos.ruta, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(TEXTO)).toBeVisible({ timeout: 15_000 });
    expect(intentos.postgrest).toBe(0);
  });

  test('si se cae la red al borrar, la publicación vuelve', async ({ page }) => {
    const intentos = await montarConPost(page, 'cae');
    await borrar(page);
    await expect.poll(() => intentos.ruta, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(TEXTO)).toBeVisible({ timeout: 15_000 });
    expect(intentos.postgrest).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Retirar un comentario del tablón sin esperar a una denuncia (App Store 1.2).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Panel · Comunidad · retirar un comentario', () => {
  test.describe.configure({ timeout: 120_000 });

  async function montarConComentario(page: Page, status: number) {
    const intentos = { retirar: 0, cuerpo: null as unknown };
    await montar(page);
    await page.route('**/rest/v1/posts_comunidad**', (r) => json(r, [{ ...POST, comentarios_count: 1 }]));
    await page.route((u) => u.pathname === '/api/comunidad/comentarios', (r) => json(r, {
      comentarios: [{ id: 'com-1', studioId: 'studio-test', postId: 'post-1', autorId: 'auth-x', autorNombre: 'Bea O.', autorInicial: 'BO', texto: 'Un comentario feo', creadoEn: new Date().toISOString(), ocultoEn: null }],
    }));
    await page.route((u) => u.pathname === '/api/comunidad/comentarios/com-1/retirar', (r) => {
      intentos.retirar++;
      intentos.cuerpo = r.request().postDataJSON();
      return status === 200 ? json(r, { retirado: true, cambiado: true }) : json(r, { error: 'No se ha podido guardar. Inténtalo otra vez.' }, status);
    });
    await ir(page, 'comunidad');
    await expect(page.getByText(TEXTO)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Comentarios (1)' }).first().click();
    return intentos;
  }

  test('lo retira y queda marcado, solo cuando el servidor lo confirma', async ({ page }) => {
    const intentos = await montarConComentario(page, 200);
    const comentario = page.getByTestId('comentario-panel').filter({ hasText: 'Un comentario feo' });
    await comentario.getByRole('button', { name: 'Retirar' }).click({ timeout: 15_000 });
    await expect(comentario).toContainText('Retirado', { timeout: 15_000 });
    await expect(comentario.getByRole('button', { name: 'Volver a mostrar' })).toBeVisible();
    expect(intentos.retirar).toBe(1);
    expect(intentos.cuerpo).toEqual({ retirar: true });
  });

  test('si el servidor dice que no, no lo marca como retirado', async ({ page }) => {
    const intentos = await montarConComentario(page, 500);
    const comentario = page.getByTestId('comentario-panel').filter({ hasText: 'Un comentario feo' });
    await comentario.getByRole('button', { name: 'Retirar' }).click({ timeout: 15_000 });
    await expect(page.getByText('No se ha podido guardar. Inténtalo otra vez.')).toBeVisible({ timeout: 15_000 });
    await expect(comentario.getByRole('button', { name: 'Retirar' })).toBeVisible();
    expect(intentos.retirar).toBeGreaterThan(0);
  });
});
