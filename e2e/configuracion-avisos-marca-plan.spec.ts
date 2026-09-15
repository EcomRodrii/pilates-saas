import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { CATEGORIAS_POR_ROL, CATEGORIA_ETIQUETA } from '../lib/notifications/catalog';

// ─────────────────────────────────────────────────────────────────────────────
// Avisos, marca, tu panel y tu plan, dentro de Configuración.
//
// El fundador lo pidió así: «que esté todo el contenido… Avisos, marca y
// suscripción». Hasta el 15-sep, las preferencias de avisos del equipo vivían en
// /configuracion/notificaciones, una pantalla que no enlazaba nadie; el menú, el
// Inicio y el color, en /configuracion/apariencia/panel; y la suscripción, fuera.
//
// Lo que se fija aquí, contra el panel sembrado:
//   · «Mis avisos» y «Tu panel» se abren desde «Tu cuenta», en el inicio;
//   · las dos pantallas de antes llevan a su sección;
//   · cambiar un aviso manda la MISMA petición que mandaba la pantalla de antes;
//   · si el servidor dice que no, se dice y el interruptor vuelve atrás. Con
//     contador: sin él, «no dijo que sí» podría ser «no llegó a intentarlo»;
//   · «Plan de Tentare» enseña el estado que da el servidor y lleva a /suscripcion.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const CATEGORIA = CATEGORIAS_POR_ROL.PROPIETARIO[0];
const INTERRUPTOR = `${CATEGORIA_ETIQUETA[CATEGORIA]} en la app`;
const ERROR_AVISO = 'No se ha podido guardar la preferencia. Inténtalo otra vez.';

async function panel(page: Page, opciones: { respuestaPreferencias?: number; billing?: Record<string, unknown> } = {}) {
  await montar(page);
  const escrituras: { url: string; cuerpo: unknown }[] = [];
  await page.route(u => u.pathname === '/api/notifications/preferences', r => {
    if (r.request().method() !== 'PUT') return json(r, { prefs: {} });
    escrituras.push({ url: new URL(r.request().url()).pathname, cuerpo: r.request().postDataJSON() });
    const status = opciones.respuestaPreferencias ?? 200;
    return status === 200 ? json(r, { ok: true }) : json(r, { error: 'No se ha podido guardar' }, status);
  });
  if (opciones.billing) {
    const billing = opciones.billing;
    await page.route('**/api/billing/status**', r => json(r, billing));
  }
  return { escrituras };
}

const tituloSeccion = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

// El favicon solo se ofrece con la marca en el plan (Estudio en adelante).
const ESTUDIO_CON_MARCA = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', plan: 'ESTUDIO', subscription_status: 'active',
};
const FAVICON_PUBLICADO = 'https://example.supabase.co/storage/v1/object/public/avatars/favicon-studio-test?v=1';
// Un PNG de 1×1: pasa la validación de formato y tamaño del cliente.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Marca con el tema en memoria: el borrador (PUT) y lo publicado (POST publish), contados aparte. */
async function montarMarca(
  page: Page,
  respuestaPublicar = 200,
  mensajeError = 'No se han podido publicar los cambios de marca. Vuelve a intentarlo.',
) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, ESTUDIO_CON_MARCA));
  await page.route('**/storage/v1/object/**', r => json(r, { Key: 'avatars/favicon-borrador-studio-test', Id: 'e2e' }));
  let tema: Record<string, unknown> = { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12, faviconUrl: null };
  let borradores = 0;
  const publicaciones: { campos?: Record<string, unknown> }[] = [];
  await page.route(u => u.pathname === '/api/theme', r => {
    if (r.request().method() === 'PUT') { borradores += 1; return json(r, tema); }
    return json(r, tema);
  });
  await page.route(u => u.pathname === '/api/theme/publish', r => {
    const cuerpo = r.request().postDataJSON() as { campos?: Record<string, unknown> };
    publicaciones.push(cuerpo);
    if (respuestaPublicar !== 200) {
      return json(r, { error: mensajeError }, respuestaPublicar);
    }
    // Como el servidor: solo cambia lo que llega, y el favicon queda en su path publicado.
    const campos = cuerpo.campos ?? {};
    tema = { ...tema, ...campos, ...(campos.faviconUrl ? { faviconUrl: FAVICON_PUBLICADO } : {}) };
    return json(r, tema);
  });
  return { publicaciones, borradores: () => borradores };
}

const archivoFavicon = (page: Page) => page.locator('input[type="file"][aria-label="Archivo de favicon"]');

test.describe('Avisos, marca, tu panel y tu plan, dentro de Configuración', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('«Mis avisos» y «Tu panel» se abren desde «Tu cuenta», en el inicio', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion');

    const cuenta = page.getByRole('region', { name: 'Tu cuenta' });
    await expect(cuenta.locator('#inicio-seccion-avisos')).toBeVisible({ timeout: 30_000 });
    await expect(cuenta.locator('#inicio-seccion-panel')).toBeVisible();
    await expect(cuenta.locator('#inicio-plan')).toBeVisible();
    await expect(cuenta.locator('#inicio-mi-cuenta')).toBeVisible();

    await cuenta.locator('#inicio-seccion-avisos').click();
    await expect(page).toHaveURL(/\/configuracion\?tab=avisos$/);
    await expect(tituloSeccion(page, 'Mis avisos')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('switch', { name: INTERRUPTOR })).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/configuracion$/);
    await page.locator('#inicio-seccion-panel').click();
    await expect(page).toHaveURL(/\/configuracion\?tab=panel$/);
    await expect(tituloSeccion(page, 'Tu panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#menu-del-panel')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Modo oscuro' })).toBeVisible();
  });

  // ⚠️ #2030: en el build de producción, un `<Link>` o `router.push` a otra
  // sección desde /configuracion dejaba la dirección en la de llegada. En `next
  // dev` no se reproduce; esto fija que el enlace de la barra superior llega y
  // que la dirección lo dice, que es lo que CI (sobre el build) sí ve.
  test('desde otra sección, la barra superior abre «Tu panel» y la dirección lo dice', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=cobros');
    await expect(tituloSeccion(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
    await page.getByRole('button', { name: /^Apariencia/ }).click();
    await page.getByRole('link', { name: /Personalizar tu panel/ }).click();

    await expect(page).toHaveURL(/\/configuracion\?tab=panel$/, { timeout: 15_000 });
    await expect(tituloSeccion(page, 'Tu panel')).toBeVisible({ timeout: 30_000 });
  });

  test('las pantallas de antes llevan a su sección', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion/notificaciones');
    await expect(page).toHaveURL(/\/configuracion\?tab=avisos$/, { timeout: 30_000 });
    await expect(tituloSeccion(page, 'Mis avisos')).toBeVisible({ timeout: 30_000 });

    await page.goto('/configuracion/apariencia/panel');
    await expect(page).toHaveURL(/\/configuracion\?tab=panel$/, { timeout: 30_000 });
    await expect(tituloSeccion(page, 'Tu panel')).toBeVisible({ timeout: 30_000 });
  });

  test('cambiar un aviso manda la misma petición que la pantalla de antes', async ({ page }) => {
    const { escrituras } = await panel(page);
    await ir(page, 'configuracion?tab=avisos');

    const interruptor = page.getByRole('switch', { name: INTERRUPTOR });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await interruptor.click();

    await expect.poll(() => escrituras.length).toBe(1);
    expect(escrituras[0]).toEqual({
      url: '/api/notifications/preferences',
      cuerpo: { studioId: 'studio-test', category: CATEGORIA, inapp: false, push: true },
    });
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(ERROR_AVISO)).toHaveCount(0);
  });

  test('si el servidor dice que no, lo dice y el interruptor vuelve atrás', async ({ page }) => {
    const { escrituras } = await panel(page, { respuestaPreferencias: 500 });
    await ir(page, 'configuracion?tab=avisos');

    const interruptor = page.getByRole('switch', { name: INTERRUPTOR });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await interruptor.click();

    await expect(page.getByText(ERROR_AVISO)).toBeVisible({ timeout: 15_000 });
    // Verde por no haberlo intentado no vale.
    expect(escrituras.length).toBeGreaterThan(0);
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/Guardad[oa]s?\b/)).toHaveCount(0);
  });

  // El favicon subido en Marca se quedaba en el borrador (solo lo publicaba el
  // editor del portal, en mantenimiento), y guardar el color lo borraba.
  test('subir un favicon lo publica, y guardar después el color no lo toca', async ({ page }) => {
    const { publicaciones, borradores } = await montarMarca(page);
    await ir(page, 'configuracion?tab=marca');
    await expect(page.getByRole('button', { name: /Subir favicon/ })).toBeEnabled({ timeout: 30_000 });

    // Solo lo subido desde aquí: el favicon se pinta en la página pública de
    // reservas y el servidor no admite un enlace de fuera, así que no se ofrece.
    const bloqueFavicon = page.getByRole('heading', { level: 4, name: 'Favicon', exact: true }).locator('..');
    await expect(bloqueFavicon.getByRole('button', { name: /Subir favicon/ })).toBeVisible();
    await expect(bloqueFavicon.getByRole('button', { name: 'o pegar un enlace' })).toHaveCount(0);

    await archivoFavicon(page).setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(() => publicaciones.length).toBe(1);
    expect(publicaciones[0]).toEqual({
      campos: { faviconUrl: expect.stringMatching(/\/storage\/v1\/object\/public\/avatars\/favicon-borrador-studio-test\?v=\d+$/) },
    });
    await expect(page.getByText('Favicon aplicado')).toBeVisible();
    await expect(page.getByRole('button', { name: /Cambiar favicon/ })).toBeVisible();

    await page.getByRole('textbox', { name: 'Color principal en hexadecimal' }).fill('#224466');
    await page.getByRole('button', { name: 'Guardar colores' }).click();
    await expect.poll(() => publicaciones.length).toBe(2);
    // Solo los dos colores: el servidor publica eso encima de lo publicado, así
    // que el favicon ni viaja ni se pisa, y el borrador no se reescribe.
    expect(publicaciones[1]).toEqual({ campos: { primary: '#224466', secondary: '#D9C29E' } });
    expect(borradores()).toBe(0);
    await expect(page.getByRole('button', { name: /Cambiar favicon/ })).toBeVisible();
  });

  test('si publicar el favicon falla, lo dice y se queda el de antes', async ({ page }) => {
    const { publicaciones } = await montarMarca(page, 500);
    await ir(page, 'configuracion?tab=marca');
    await expect(page.getByRole('button', { name: /Subir favicon/ })).toBeEnabled({ timeout: 30_000 });

    await archivoFavicon(page).setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText(/No se ha(n)? podido publicar/)).toBeVisible({ timeout: 15_000 });
    // Verde por no haberlo intentado no vale.
    expect(publicaciones.length).toBeGreaterThan(0);
    await expect(page.getByText('Favicon aplicado')).toHaveCount(0);
    await expect(page.getByText(/Guardad[oa]s?\b/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Subir favicon/ })).toBeVisible();
  });

  // Otra pestaña guardó la marca entre medias y el servidor no pudo escribir sin
  // pisarla: responde 409 con un motivo que se puede leer, y se enseña TAL CUAL.
  test('si otra pestaña acaba de cambiar la marca, lo dice y no da el favicon por aplicado', async ({ page }) => {
    const conflicto = 'La marca acaba de cambiar desde otra pestaña. Recarga la página y vuelve a intentarlo.';
    const { publicaciones } = await montarMarca(page, 409, conflicto);
    await ir(page, 'configuracion?tab=marca');
    await expect(page.getByRole('button', { name: /Subir favicon/ })).toBeEnabled({ timeout: 30_000 });

    await archivoFavicon(page).setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText(conflicto)).toBeVisible({ timeout: 15_000 });
    // Verde por no haberlo intentado no vale.
    expect(publicaciones.length).toBeGreaterThan(0);
    await expect(page.getByText('Favicon aplicado')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Subir favicon/ })).toBeVisible();
  });

  test('«Plan de Tentare» dice cómo va la prueba y lleva a /suscripcion', async ({ page }) => {
    await panel(page, {
      billing: {
        plan: 'ESTUDIO', subscriptionStatus: 'trialing', activo: true, configurado: true,
        esPropietaria: true, bloqueado: false, enPrueba: true,
        trial: { fase: 'HOLGADA', diasRestantes: 5, finaliza: '2099-01-06T10:00:00Z' },
      },
    });
    await ir(page, 'configuracion');

    const plan = page.locator('#inicio-plan');
    await expect(plan.locator('[data-resumen="valor"]')).toHaveText('Prueba del plan Estudio · quedan 5 días', { timeout: 30_000 });
    await expect(plan).toHaveAttribute('href', '/suscripcion');
    await expect(plan.locator('[data-estado-ajuste]')).toHaveCount(0);

    // Y el buscador lo encuentra, con el mismo destino.
    await page.getByRole('searchbox', { name: 'Buscar un ajuste' }).fill('plan');
    const resultado = page.getByRole('list', { name: 'Resultados de la búsqueda' }).getByRole('link', { name: /Plan de Tentare/ });
    await expect(resultado).toHaveAttribute('href', '/suscripcion');
  });
});
