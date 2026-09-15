import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar el centro unos días. Toca dos cosas serias a la vez —cancela clases y
// mueve la caducidad de TODOS los bonos del estudio— así que la pantalla no
// puede dispararlo de un clic ni antes de tener las fechas.
//
// Desde el 15-sep (v2) es una fila de Mi estudio con su cajón: «Guardar» sale
// al tocar algo, se queda apagado sin las dos fechas y pregunta antes de mandar.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface FilaCierre { id: string; studio_id: string; desde: string; hasta: string; motivo: string | null }

/** Fecha local a `n` días de hoy (`YYYY-MM-DD`). Márgenes de varios días: CI va en UTC y el estudio en Madrid. */
const dentroDe = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};

async function abrirCierre(
  page: Page,
  capturar: string[],
  opts: { cierres?: FilaCierre[]; borrar?: 'ok' | 500 } = {},
) {
  // La tabla de mentira: un DELETE confirmado la cambia, como haría la BD.
  const filas = [...(opts.cierres ?? [])];
  const borrados: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/cierres**', route => {
    if (route.request().method() === 'DELETE') {
      const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
      borrados.push(cuerpo);
      if (opts.borrar === 500) return json(route, { error: 'No se ha podido quitar el cierre' }, 500);
      const i = filas.findIndex(f => f.id === cuerpo.id);
      if (i >= 0) filas.splice(i, 1);
      return json(route, { ok: true, id: cuerpo.id });
    }
    capturar.push(route.request().postData() ?? '');
    return json(route, { cierreId: 'cie-1', dias: 7, clasesCanceladas: 12, bonosAmpliados: 30, recuperacionesAmpliadas: 4, incidencias: [] });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/cierres_estudio**', route => json(route, filas));
  // El recuento de clases canceladas por cierre va con `count` (HEAD): la cifra viaja en Content-Range.
  await page.route('**/rest/v1/sesiones**', route => route.fulfill({
    status: 200, body: '',
    headers: { 'content-range': '*/3', 'access-control-expose-headers': 'content-range' },
  }));

  await page.goto('/configuracion?tab=estudio#cerrar-el-centro');
  await expect(page.getByRole('heading', { level: 2, name: 'Cerrar el centro', exact: true })).toBeVisible({ timeout: 30_000 });
  return { filas, borrados };
}

const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const cajon = (page: Page) => page.getByRole('dialog', { name: 'Cerrar el centro' });

test('sin las dos fechas no se puede disparar, y sin tocar nada no hay botón', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);
  await expect(guardar(page)).toHaveCount(0);

  await page.getByLabel('Desde').fill('2026-08-10');
  await expect(guardar(page)).toBeDisabled();
  await expect(cajon(page).getByRole('alert')).toContainText('Elige el primer y el último día');
  expect(enviados).toEqual([]);
});

test('avisa si la fecha de fin es anterior a la de inicio', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);
  await page.getByLabel('Desde').fill('2026-08-16');
  await page.getByLabel('Hasta (incluido)').fill('2026-08-10');
  await expect(cajon(page).getByRole('alert')).toContainText('La fecha de fin no puede ser anterior');
  await expect(guardar(page)).toBeDisabled();
  expect(enviados).toEqual([]);
});

test('pide confirmación antes de cancelar nada, y manda el rango real', async ({ page }) => {
  const enviados: string[] = [];
  await abrirCierre(page, enviados);

  await page.getByLabel('Desde').fill('2026-08-10');
  await page.getByLabel('Hasta (incluido)').fill('2026-08-16');
  await guardar(page).click();

  // Un clic NO basta: cancela clases y mueve la caducidad de todos los bonos.
  const pregunta = page.getByRole('dialog', { name: /¿Cerrar el centro/ });
  await expect(pregunta).toContainText(/no se deshace solo/);
  expect(enviados, 'se disparó sin confirmar').toEqual([]);

  await pregunta.getByRole('button', { name: 'Sí, cerrar esos días' }).click();
  await expect.poll(() => enviados.length, { timeout: 15_000 }).toBe(1);
  const cuerpo = JSON.parse(enviados[0]);
  expect(cuerpo.desde).toBe('2026-08-10');
  expect(cuerpo.hasta).toBe('2026-08-16');
  // Hecho: el cajón se cierra y se cuenta qué ha pasado.
  await expect(cajon(page)).toHaveCount(0);
  await expect(page.getByText('7 días cerrados · 12 clases canceladas · 30 bonos prorrogados')).toBeVisible();
});

// ─── La lista de cierres puestos, y quitar uno ───────────────────────────────
//
// Quitar un cierre solo borra la fila: las clases canceladas, sus reservas y los
// días de más de los bonos se quedan como estaban. La confirmación tiene que
// decirlo, y el cierre no sale de la lista hasta que el servidor lo ha borrado.

const CIERRES: FilaCierre[] = [
  { id: 'cie-proximo', studio_id: STUDIO_ID, desde: dentroDe(20), hasta: dentroDe(22), motivo: 'Puente' },
  { id: 'cie-pasado', studio_id: STUDIO_ID, desde: dentroDe(-40), hasta: dentroDe(-35), motivo: 'Reforma' },
  { id: 'cie-curso', studio_id: STUDIO_ID, desde: dentroDe(-2), hasta: dentroDe(2), motivo: null },
];

const filaCierre = (page: Page, id: string) => cajon(page).locator(`[data-cierre="${id}"]`);
const valorFila = (page: Page) => page.locator('#cerrar-el-centro [data-resumen]');

test('lista los cierres que vienen y, plegados, los pasados; uno que ya pasó no ofrece nada', async ({ page }) => {
  await abrirCierre(page, [], { cierres: CIERRES });

  const vienen = cajon(page).locator('section', { has: page.getByRole('heading', { name: 'Cierres que vienen' }) });
  await expect(vienen.locator('> ul > li')).toHaveCount(2);
  // El que está en curso primero, luego el que viene.
  await expect(vienen.locator('> ul > li').first()).toHaveAttribute('data-cierre', 'cie-curso');
  await expect(filaCierre(page, 'cie-curso')).toContainText('cerrado ahora');
  await expect(filaCierre(page, 'cie-curso').getByRole('button', { name: 'Reabrir desde hoy' })).toBeVisible();
  await expect(filaCierre(page, 'cie-proximo')).toContainText('Puente · 3 clases canceladas');
  await expect(filaCierre(page, 'cie-proximo').getByRole('button', { name: 'Quitar este cierre' })).toBeVisible();

  const pasado = filaCierre(page, 'cie-pasado');
  await expect(pasado).toBeHidden();
  await cajon(page).getByText('Ver cierres pasados (1)').click();
  await expect(pasado).toBeVisible();
  await expect(pasado).toContainText('Reforma');
  await expect(pasado.getByRole('button')).toHaveCount(0);
});

test('quitar pregunta y dice lo que no vuelve; sale de la lista cuando el servidor lo ha borrado', async ({ page }) => {
  const { borrados } = await abrirCierre(page, [], { cierres: CIERRES });
  await expect(valorFila(page)).toHaveText(/ · 1 cierre más$/);

  const fila = filaCierre(page, 'cie-proximo');
  await fila.getByRole('button', { name: 'Quitar este cierre' }).click();
  const pregunta = page.getByRole('dialog', { name: /^¿Quitar el cierre del / });
  await expect(pregunta).toContainText('Las clases canceladas no vuelven, ni sus reservas');
  await expect(pregunta).toContainText('no se avisa a nadie');
  expect(borrados, 'se borró sin confirmar').toEqual([]);

  await pregunta.getByRole('button', { name: 'Sí, quitar el cierre' }).click();
  await expect.poll(() => borrados.length, { timeout: 15_000 }).toBe(1);
  expect(borrados[0]).toEqual({ id: 'cie-proximo', desde: CIERRES[0].desde, hasta: CIERRES[0].hasta });
  await expect(fila).toHaveCount(0);
  await expect(page.getByText('Cierre quitado')).toBeVisible();
  // El cajón sigue abierto, y la fila de Mi estudio ya no cuenta el quitado.
  await expect(cajon(page)).toBeVisible();
  await expect(valorFila(page)).toHaveText(/^Cerrado hasta el \d{1,2} \p{L}+$/u);
});

test('si el servidor dice que no, lo dice y el cierre sigue en la lista', async ({ page }) => {
  const { borrados } = await abrirCierre(page, [], { cierres: CIERRES, borrar: 500 });

  const fila = filaCierre(page, 'cie-curso');
  await fila.getByRole('button', { name: 'Reabrir desde hoy' }).click();
  const pregunta = page.getByRole('dialog', { name: '¿Reabrir el centro desde hoy?' });
  await expect(pregunta).toContainText('Las clases canceladas no vuelven');
  await pregunta.getByRole('button', { name: 'Sí, reabrir' }).click();

  await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha quitado: .+\. El cierre sigue puesto\.$/);
  // «No dijo que se quitó» también sería verdad si nunca se hubiera intentado.
  expect(borrados.length, 'intentos de borrar').toBeGreaterThan(0);
  await expect(fila).toBeVisible();
  await expect(fila.getByRole('button', { name: 'Reabrir desde hoy' })).toBeEnabled();
  await expect(filaCierre(page, 'cie-proximo')).toBeVisible();
  await expect(valorFila(page)).toHaveText(/ · 1 cierre más$/);
  await expect(page.getByText('Centro abierto de nuevo')).toHaveCount(0);
});
