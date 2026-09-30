import { test, expect, type Page, type Route } from '@playwright/test';
import { firmaCodigo } from '../lib/widgets/integracion.ts';
import { CONFIG_POR_DEFECTO } from '../lib/widgets/config.ts';
import { widgetPorId, esDisponible } from '../lib/widgets/catalogo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El código del widget por ID en el panel (30-sep-2026): el código lleva solo el
// id, cambiar lo que enseña se aplica con «Aplicar en mi web» sin volver a pegar
// nada, y copiar también aplica. Lo que va en el propio HTML sigue pidiendo
// pegarlo otra vez (lo cubren los unitarios, lib/widgets/pieza-emitir.test.ts).
//
// Todos los caminos que escriben cuentan peticiones: «no dijo Aplicado» también
// sería verdad con un botón que no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const SLUG = 'pilates-centro';
const STORAGE_KEY = 'sb-example-auth-token';
const ID = 'Ab3dE5gH9k';
const T0 = '2026-09-29T10:00:00.000+00:00';

const TIPOS = [
  { id: 'tc-r', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracion_min: 50 },
  { id: 'tc-m', studio_id: STUDIO_ID, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', duracion_min: 50 },
];

const HORARIO = widgetPorId('horario');
if (!esDisponible(HORARIO)) throw new Error('«Horario» debería estar disponible');

/** La copia de un código por id del horario, como la dejaría una visita anterior. */
function copiaPorId() {
  const firma = firmaCodigo({ widget: HORARIO as never, config: CONFIG_POR_DEFECTO, origen: '', slug: SLUG, pieza: ID }, 'iframe');
  return { firma, en: '2026-09-29T10:05:00.000Z', metodo: 'iframe', pieza: ID };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Respuesta = 'ok' | '409' | '500';

async function montar(page: Page, opts: { piezas?: unknown[]; widgetBuilder?: Record<string, unknown>; respuesta?: Respuesta; nuevoId?: string }) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: SLUG, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825', widget_dominios_autorizados: [],
    widget_builder: { ...(opts.widgetBuilder ?? {}), _web: { plataforma: 'otra' } },
  };
  const pedidos: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t: string) => { (window as unknown as { __copiado?: string }).__copiado = t; return Promise.resolve(); } },
      configurable: true,
    });
  }, [STORAGE_KEY, AUTH_UID] as const);

  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', route => json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/api/public/session**', route => json(route, { error: 'no' }, 404));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      Object.assign(studioRow, route.request().postDataJSON() as Record<string, unknown>);
      return json(route, [{ id: STUDIO_ID }]);
    }
    return json(route, studioRow);
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/widget_piezas**', route => json(route, opts.piezas ?? []));
  await page.route('**/api/estudio/widget-pieza', route => {
    if (route.request().method() !== 'POST') return json(route, {}, 405);
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    pedidos.push(cuerpo);
    const r = opts.respuesta ?? 'ok';
    if (r === '409') return json(route, { error: 'Mientras lo tenías abierto, se aplicaron otros cambios a este widget. Recarga la página para ver lo que hay en tu web antes de aplicar.' }, 409);
    if (r === '500') return json(route, { error: 'No se han podido aplicar los cambios. Vuelve a intentarlo.' }, 500);
    return json(route, { id: opts.nuevoId ?? ID, config: cuerpo.config, actualizadoEn: '2026-09-30T08:00:00.000+00:00' });
  });

  await page.goto('/configuracion?tab=api');
  await expect(page.getByText('Widgets para tu web')).toBeVisible({ timeout: 60_000 });
  return { pedidos };
}

const snippet = (page: Page) => page.locator('pre');
const paso = (page: Page, nombre: 'Qué y dónde' | 'Cómo se ve' | 'Ponlo en tu web') =>
  page.getByRole('navigation', { name: 'Pasos' }).getByRole('button', { name: nombre, exact: true }).click();
const sinAplicar = (page: Page) => page.getByRole('region', { name: 'Cambios sin aplicar' });

/** Desde la portada, al horario ya pegado por id, y a enseñar solo Mat. */
async function soloMat(page: Page) {
  await page.getByRole('button', { name: /^Cambiar Horario/ }).click();
  await page.getByRole('group', { name: 'Qué clases salen' }).getByRole('button', { name: 'Solo algunas' }).click();
  await page.getByRole('group', { name: 'Solo estas clases' }).getByRole('button', { name: 'Mat' }).click();
}

const PUBLICADA = [{ id: ID, widget: 'horario', config: {}, actualizado_en: T0 }];

test('pegado por id: cambiar qué clases salen NO pide pegarlo otra vez; «Aplicar en mi web» manda lo de ahora y lo que tenía en pantalla', async ({ page }) => {
  const { pedidos } = await montar(page, { piezas: PUBLICADA, widgetBuilder: { horario: { copiado: copiaPorId() } } });
  await soloMat(page);
  await expect(snippet(page)).toContainText(`/reservar/${SLUG}?embed=1&w=${ID}`);
  await expect(snippet(page)).not.toContainText('tipos=');
  await expect(page.getByText(/Has cambiado algo que va en el código/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Qué enseña' })).toContainText('Se actualiza solo');

  await expect(sinAplicar(page)).toContainText('qué clases salen');
  await sinAplicar(page).getByRole('button', { name: 'Aplicar en mi web' }).click();
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ widget: 'horario', esperado: T0, config: { tipos: ['tc-m'] } });
  await expect(page.getByText('Aplicado. Tu web lo enseñará en unos minutos.')).toBeVisible();
  await expect(sinAplicar(page)).toHaveCount(0);
});

test('si el servidor dice que no (409), no dice «Aplicado» y los cambios siguen sin aplicar', async ({ page }) => {
  const { pedidos } = await montar(page, { piezas: PUBLICADA, widgetBuilder: { horario: { copiado: copiaPorId() } }, respuesta: '409' });
  await soloMat(page);
  await sinAplicar(page).getByRole('button', { name: 'Aplicar en mi web' }).click();
  await expect.poll(() => pedidos.length).toBeGreaterThan(0);
  await expect(page.getByText(/se aplicaron otros cambios a este widget/)).toBeVisible();
  await expect(page.getByText('Aplicado. Tu web lo enseñará en unos minutos.')).toHaveCount(0);
  await expect(sinAplicar(page)).toBeVisible();
});

test('copiar con cambios sin aplicar copia el código por id y aplica; si aplicar falla, lo dice y el aviso se queda', async ({ page }) => {
  const { pedidos } = await montar(page, { piezas: PUBLICADA, widgetBuilder: { horario: { copiado: copiaPorId() } }, respuesta: '500' });
  await soloMat(page);
  await paso(page, 'Ponlo en tu web');
  await page.getByRole('button', { name: 'Copiar código' }).click();
  await expect.poll(() => pedidos.length).toBeGreaterThan(0);
  const copiado = await page.evaluate(() => (window as unknown as { __copiado?: string }).__copiado);
  expect(copiado).toContain(`w=${ID}`);
  await expect(page.getByText(/El código está copiado, pero tus cambios no se han aplicado/)).toBeVisible();
  await expect(sinAplicar(page)).toBeVisible();
});

test('la primera vez en «Ponlo en tu web» se crea lo publicado, y el código pasa a llevar el id', async ({ page }) => {
  const NUEVO = 'Zz9yX8wV7u';
  const { pedidos } = await montar(page, { piezas: [], nuevoId: NUEVO });
  // Sin nada copiado se entra por «Qué y dónde», con el código de siempre.
  await expect(snippet(page)).toContainText(`/reservar/${SLUG}?embed=1&tab=clases`);
  await paso(page, 'Ponlo en tu web');
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]).toMatchObject({ widget: 'horario', esperado: null });
  await expect(snippet(page)).toContainText(`/reservar/${SLUG}?embed=1&w=${NUEVO}`);
  await expect(page.getByRole('button', { name: 'Copiar código' })).toBeEnabled();
  // Crearlo no es aplicar nada: no hay aviso, ni constancia que dar.
  await expect(page.getByText('Aplicado. Tu web lo enseñará en unos minutos.')).toHaveCount(0);
});
