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
