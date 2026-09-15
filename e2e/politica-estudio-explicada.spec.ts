import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que le pasa a cada alumna con lo que el estudio tiene guardado, en
// Configuración → Cómo reservan mis alumnas.
//
// Tres decisiones que le pasan a cada alumna —recuperar la sesión, la plaza que
// se libera, el aviso cuando cambia su clase— eran interruptores sueltos. Desde
// el 15-sep (v2) cada una es una FILA con su valor de hoy, y dentro de su cajón
// una línea dice lo que va a pasar.
//
// Lo que protege este spec no es el texto, es que el texto no mienta:
//  · las filas salen de lo GUARDADO: si «Guardar» falla, no cambian;
//  · el aviso a las alumnas tiene un solo escritor (`/api/sustituciones`): si el
//    servidor dice que no, el interruptor vuelve a lo guardado y se dice por qué;
//  · la gerencia (MANAGER) lo sigue pudiendo cambiar desde Sustituciones, y no se
//    le enlaza a Configuración, que no puede abrir.
// ⚠️ Cada camino de fallo cuenta peticiones: «no dijo Guardado» también es
// verdad si nunca se intentó escribir.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const OTRA_DUENA = 'auth-e2e-otra-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

type Fallo = 400 | 500 | 'red';
type Rol = 'PROPIETARIO' | 'MANAGER' | 'RECEPCION';

const FILA_BASE = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  cancelacion_ventana_horas: 24,
  cancelacion_devolver_bono_tardia: false,
  cancelacion_clase_devuelve_bono: true,
  permite_lista_espera: true,
  lista_espera_plazo_aceptacion_minutos: 15,
  avisar_alumnas: true,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function responder(route: Route, fallo: Fallo | null, ok: unknown) {
  if (fallo === 'red') return route.abort('failed');
  if (fallo === 400) return json(route, { code: '22023', message: 'valor no válido', error: 'Falta el valor' }, 400);
  if (fallo === 500) return json(route, { code: 'XX000', message: 'error interno', error: 'No se ha podido guardar el ajuste de avisos. Vuelve a intentarlo.' }, 500);
  return json(route, ok);
}

async function montar(page: Page, opts: {
  fila?: Partial<typeof FILA_BASE>;
  falloStudio?: Fallo;
  falloAvisar?: Fallo;
  retrasoAvisarMs?: number;
  rol?: Rol;
} = {}) {
  const patchesStudio: string[] = [];
  const patchesAvisar: unknown[] = [];
  const rol = opts.rol ?? 'PROPIETARIO';

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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/decisiones/confirmacion-riesgo', route => json(route, { activo: false }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Fuera de PROPIETARIO, la usuaria no es la dueña: su rol sale de su ficha de
  // equipo (useRol) y lo confirma `mis_estudios`.
  const fila = { ...FILA_BASE, ...(rol === 'PROPIETARIO' ? {} : { owner_auth_user_id: OTRA_DUENA }), ...opts.fila };
  if (rol !== 'PROPIETARIO') {
    await page.route('**/rest/v1/instructores**', route => json(route, [{
      id: 'ins-yo', studio_id: STUDIO_ID, nombre: 'Laura Gil', activo: true, rol,
      color: '#2C352C', auth_user_id: AUTH_UID, email: 'laura@example.com', telefono: null,
    }]));
    await page.route('**/rest/v1/rpc/mis_estudios', route =>
      json(route, [{ id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', ciudad: null, rol }]));
  }
  await page.route('**/rest/v1/studios**', route => {
    if (route.request().method() === 'PATCH') {
      patchesStudio.push(route.request().postData() ?? '');
      // Lo que devuelve PostgREST con `select=id`; `[]` sería «no se guardó».
      return responder(route, opts.falloStudio ?? null, [{ id: STUDIO_ID }]);
    }
    return json(route, fila);
  });
  // ⚠️ Después del comodín `**/api/**`: Playwright prueba las rutas en orden
  // INVERSO al registro.
  await page.route('**/api/sustituciones', async route => {
    if (route.request().method() === 'GET') {
      return json(route, { sustituciones: [], avisarAlumnas: fila.avisar_alumnas, modoAutonomia: 'asistido', autonomiaDisponible: true, equipo: { total: 0, sinDisponibilidad: [] } });
    }
    patchesAvisar.push(route.request().postDataJSON());
    if (opts.retrasoAvisarMs) await new Promise(r => setTimeout(r, opts.retrasoAvisarMs));
    const body = route.request().postDataJSON() as { avisar?: boolean };
    return responder(route, opts.falloAvisar ?? null, { ok: true, avisarAlumnas: body.avisar });
  });

  return { patchesStudio, patchesAvisar };
}

const valorFila = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const guardarPolitica = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const sinGuardar = (page: Page, tarjeta: string) => page.getByText(`Cambios sin guardar en: ${tarjeta}`);
const filaAvisos = (page: Page) => page.locator('#ajuste-avisar-alumnas');
// En Configuración, la fila; en Sustituciones, su interruptor de siempre.
const avisosEnConfiguracion = (page: Page) => page.getByRole('switch', { name: 'Avisos a las alumnas' });
const interruptorAvisar = (page: Page) => page.getByRole('switch', { name: /Avisar a las alumnas, por email y en su app/ });
const consecuencia = (page: Page) => page.getByRole('dialog').locator('[data-consecuencia]');

async function abrirReservas(page: Page) {
  await page.goto('/configuracion?tab=estudio&sub=reservas');
  await expect(avisosEnConfiguracion(page)).toBeVisible({ timeout: 30_000 });
}

test('las filas dicen lo que el estudio tiene guardado, y cada cajón lo que va a pasar', async ({ page }) => {
  await montar(page);
  await abrirReservas(page);

  await expect(valorFila(page, 'cancelar-y-recuperar')).toHaveText('Hasta 24 h antes · después pierde la sesión');
  await expect(valorFila(page, 'si-se-cancela-una-clase')).toHaveText('Devuelve la sesión · sin mínimo');
  await expect(valorFila(page, 'lista-de-espera')).toHaveText('Oferta de 15 min');
  await expect(avisosEnConfiguracion(page)).toHaveAttribute('aria-checked', 'true');

  await page.locator('#cancelar-y-recuperar').click();
  await expect(consecuencia(page)).toHaveText('Si cancela con menos de 24 h, no recupera la sesión.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // El ancla de antes de un ajuste suelto lleva al cajón donde está hoy.
  await page.goto('/configuracion?tab=reservas#ajuste-lista-espera');
  await expect(page.getByRole('heading', { level: 2, name: 'Lista de espera', exact: true })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /Se le ofrece durante 15 minutos/ })).toBeChecked();
  await expect(consecuencia(page)).toHaveText('Si se libera una plaza, la primera de la lista tiene 15 min para aceptarla; si no, pasa a la siguiente.');
});

test('con otros valores guardados, otras filas', async ({ page }) => {
  await montar(page, {
    fila: {
      cancelacion_ventana_horas: 0,
      cancelacion_clase_devuelve_bono: false,
      permite_lista_espera: false,
      avisar_alumnas: false,
    },
  });
  await abrirReservas(page);

  await expect(valorFila(page, 'cancelar-y-recuperar')).toHaveText('Sin plazo para cancelar');
  await expect(valorFila(page, 'si-se-cancela-una-clase')).toHaveText('No devuelve la sesión · sin mínimo');
  await expect(valorFila(page, 'lista-de-espera')).toHaveText('Sin lista de espera');
  await expect(avisosEnConfiguracion(page)).toHaveAttribute('aria-checked', 'false');
  // Sin plazo no hay «cancelar tarde» del que hablar.
  await page.locator('#cancelar-y-recuperar').click();
  await expect(consecuencia(page)).toHaveText('Recupera la sesión cancele cuando cancele: no hay plazo de cancelación.');
});

for (const fallo of [400, 500, 'red'] as const) {
  test(`«Guardar» falla (${fallo}): ni «guardada» ni fila nueva`, async ({ page }) => {
    const { patchesStudio, patchesAvisar } = await montar(page, { falloStudio: fallo });
    await abrirReservas(page);

    await page.locator('#si-se-cancela-una-clase').click();
    const toggle = page.getByRole('switch', { name: /Devolver la sesión al cancelar una clase entera/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(sinGuardar(page, 'Si se cancela una clase entera')).toBeVisible();

    await guardarPolitica(page).click();
    await expect.poll(() => patchesStudio.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // Termina el intento (el botón se apaga mientras guarda) antes de mirar.
    await expect(guardarPolitica(page)).toBeEnabled({ timeout: 15_000 });

    await expect(page.getByText(/Reglas de reserva guardadas/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Cambios sin guardar' }).getByRole('alert')).toContainText('No se ha guardado');
    await expect(sinGuardar(page, 'Si se cancela una clase entera')).toBeVisible();
    await expect(valorFila(page, 'si-se-cancela-una-clase')).toHaveText('Devuelve la sesión · sin mínimo');
    // Solo sus dos columnas, y el aviso a las alumnas no viaja nunca por aquí.
    expect(Object.keys(JSON.parse(patchesStudio[0])).sort()).toEqual(['cancelacion_clase_devuelve_bono', 'minimo_asistentes_por_clase']);
    expect(patchesStudio.join(' ')).not.toContain('avisar_alumnas');
    expect(patchesAvisar).toHaveLength(0);
  });
}

test('«Guardar» sale bien: la fila cambia', async ({ page }) => {
  const { patchesStudio } = await montar(page);
  await abrirReservas(page);

  await page.locator('#si-se-cancela-una-clase').click();
  await page.getByRole('switch', { name: /Devolver la sesión al cancelar una clase entera/ }).click();
  await expect(consecuencia(page)).toContainText('no devuelve la sesión');
  await guardarPolitica(page).click();

  await expect(page.getByText('Reglas de reserva guardadas')).toBeVisible({ timeout: 15_000 });
  await expect(valorFila(page, 'si-se-cancela-una-clase')).toHaveText('No devuelve la sesión · sin mínimo');
  expect(patchesStudio.length).toBeGreaterThan(0);
  expect(patchesStudio[patchesStudio.length - 1]).toContain('"cancelacion_clase_devuelve_bono":false');
});

for (const fallo of [400, 500, 'red'] as const) {
  test(`el aviso a las alumnas falla (${fallo}): el interruptor vuelve a lo guardado y dice por qué`, async ({ page }) => {
    const { patchesAvisar, patchesStudio } = await montar(page, { falloAvisar: fallo });
    await abrirReservas(page);

    const toggle = avisosEnConfiguracion(page);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();
    await toggle.click();

    await expect.poll(() => patchesAvisar.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(filaAvisos(page).getByRole('alert')).toContainText('No se ha guardado', { timeout: 15_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();
    // Por su endpoint, nunca por el PATCH de `studios`.
    expect(patchesAvisar[0]).toEqual({ action: 'config_avisar', avisar: false });
    expect(patchesStudio).toHaveLength(0);
  });
}

test('el aviso a las alumnas: doble toque = una escritura, y se queda en lo guardado de verdad', async ({ page }) => {
  const { patchesAvisar, patchesStudio } = await montar(page, { retrasoAvisarMs: 1500 });
  await abrirReservas(page);

  const toggle = avisosEnConfiguracion(page);
  await expect(toggle).toBeEnabled();
  await toggle.dblclick();
  // Mientras el servidor no contesta, está ocupado y no se deja tocar.
  await expect(toggle).toHaveAttribute('aria-busy', 'true');

  await expect(page.getByText('Aviso a las alumnas desactivado')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
  expect(patchesAvisar).toHaveLength(1);
  expect(patchesAvisar[0]).toEqual({ action: 'config_avisar', avisar: false });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(filaAvisos(page).getByRole('alert')).toHaveCount(0);
  expect(patchesStudio).toHaveLength(0);
});

test('Sustituciones, propietaria: el mismo ajuste y el enlace a Configuración', async ({ page }) => {
  const { patchesAvisar } = await montar(page);
  await page.goto('/sustituciones');

  const toggle = interruptorAvisar(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  const enlace = page.getByRole('link', { name: 'Qué más pasa cuando una clase cambia' });
  await expect(enlace).toHaveAttribute('href', '/configuracion?tab=reservas#ajuste-avisar-alumnas');

  await enlace.click();
  await expect(avisosEnConfiguracion(page)).toBeFocused({ timeout: 30_000 });
  expect(patchesAvisar).toHaveLength(0);
});

test('Sustituciones, gerencia: lo sigue cambiando aquí, sin enlace a una pantalla que no puede abrir', async ({ page }) => {
  const { patchesAvisar } = await montar(page, { rol: 'MANAGER' });
  await page.goto('/sustituciones');

  const toggle = interruptorAvisar(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Qué más pasa cuando una clase cambia' })).toHaveCount(0);
  // El marco del panel tiene su propio enlace de cuenta a /configuracion; lo que
  // no puede aparecer es el que lleva a Reservas, la pantalla que este rol no abre.
  await expect(page.locator('a[href*="tab=reservas"]')).toHaveCount(0);

  await toggle.click();
  await expect(page.getByText('Guardado.')).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(patchesAvisar).toEqual([{ action: 'config_avisar', avisar: false }]);
});

test('Sustituciones, gerencia: si el servidor dice que no, no se mueve', async ({ page }) => {
  const { patchesAvisar } = await montar(page, { rol: 'MANAGER', falloAvisar: 500 });
  await page.goto('/sustituciones');

  const toggle = interruptorAvisar(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await toggle.click();
  await expect.poll(() => patchesAvisar.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha guardado' })).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('Sustituciones, recepción: lo que pasa y quién lo decide, sin interruptor', async ({ page }) => {
  const { patchesAvisar } = await montar(page, { rol: 'RECEPCION' });
  await page.goto('/sustituciones');

  await expect(page.getByText(
    'Tentare avisa a sus alumnas por email y en su app cuando se cubre, se mueve o se cancela una clase. Lo decide la propietaria o la gerencia.',
  )).toBeVisible({ timeout: 30_000 });
  await expect(interruptorAvisar(page)).toHaveCount(0);
  // El marco del panel tiene su propio enlace de cuenta a /configuracion; lo que
  // no puede aparecer es el que lleva a Reservas, la pantalla que este rol no abre.
  await expect(page.locator('a[href*="tab=reservas"]')).toHaveCount(0);
  expect(patchesAvisar).toHaveLength(0);
});
