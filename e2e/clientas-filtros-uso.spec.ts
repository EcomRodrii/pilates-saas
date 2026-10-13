import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Clientas: los filtros de cómo viene cada una y las columnas a elegir (P2.8).
//
// Entran APAGADOS: solo los ve el estudio que el servidor dice que los tiene
// encendidos (`GET /api/estudio/interruptores`, interruptor `CLIENTAS_FILTROS`).
// Aquí se fija:
//   - apagado (o con el servidor fallando), Clientas es la de siempre, aunque la
//     URL traiga un filtro nuevo; y el apagado se comprueba PREGUNTANDO (un
//     contador de peticiones: sin él, «no se ve» podría ser «no ha preguntado»);
//   - encendido, cada filtro enseña exactamente a quien dice, con su definición;
//   - el filtro va en la URL y sobrevive a recargar;
//   - las columnas se guardan por persona y estudio, solo en pantallas anchas.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Fechas en el día del estudio: las semanas van de lunes a domingo en Madrid.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fecha = (n: number) => {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const lunesHoy = (() => {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
})();
/** Un día (0 = lunes) de la semana `atras` semanas antes de esta, a las 10/11 de Madrid. */
const dia = (atras: number, dow: number) => {
  const d = new Date(lunesHoy);
  d.setUTCDate(d.getUTCDate() - 7 * atras + dow);
  return `${d.toISOString().slice(0, 10)}T09:00:00.000Z`;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const socia = (id: string, nombre: string, apellidos: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos, email: `${id}@example.com`, telefono: `60000000${id.slice(1)}`, activo: true,
  fecha_alta: '2026-01-01T09:00:00+00:00', campos_extra: {}, tags: [], lead_stage: 'ACTIVA', ...extra,
});

// Ana: 2 clases cada semana (alta, todas las semanas), cuota y un bono con 1.
// Bea: 1 por semana hasta hace tres (media, 7 en 9 semanas) y nada en las dos últimas completas
// (ha dejado de venir: la semana en curso no cuenta hasta que acaba), bono con 5.
// Carla: solo hizo la prueba. Dani: interesada, sin nada. Eva: 1 cada semana (media, todas).
// Fran: importada de otra plataforma con historial y sin nada aquí: NO es «nunca ha comprado».
const SOCIOS = [
  socia('s1', 'Ana', 'Ruiz'),
  socia('s2', 'Bea', 'Soto'),
  socia('s3', 'Carla', 'Vela', { lead_stage: 'PRUEBA' }),
  socia('s4', 'Dani', 'Mora', { lead_stage: 'LEAD' }),
  socia('s5', 'Eva', 'Gil'),
  socia('s6', 'Fran', 'Luna'),
];
const TODAS = SOCIOS.length;
const PLANES = [
  { id: 'pl-mensual', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true, es_prueba: false },
  { id: 'pl-bono', studio_id: STUDIO_ID, nombre: 'Bono 10', precio: 130, tipo: 'BONO', sesiones: 10, validez_dias: 90, activo: true, es_prueba: false },
  { id: 'pl-prueba', studio_id: STUDIO_ID, nombre: 'Clase de prueba', precio: 0, tipo: 'PUNTUAL', sesiones: 1, validez_dias: 30, activo: true, es_prueba: true },
];
const cuota = (id: string, socio: string, plan: string, estado: string, ini: number, fin: number, restantes: number | null) => ({
  id, studio_id: STUDIO_ID, socio_id: socio, plan_id: plan, estado,
  fecha_inicio: fecha(ini), fecha_fin: fecha(fin), sesiones_restantes: restantes, stripe_subscription_id: null,
});
const SUSCRIPCIONES = [
  cuota('sus-1', 's1', 'pl-mensual', 'ACTIVA', -60, 20, null),
  cuota('sus-1b', 's1', 'pl-bono', 'ACTIVA', -30, 60, 1),
  cuota('sus-2', 's2', 'pl-bono', 'ACTIVA', -60, 30, 5),
  cuota('sus-3', 's3', 'pl-prueba', 'EXPIRADA', -40, -10, 0),
  cuota('sus-5', 's5', 'pl-mensual', 'ACTIVA', -60, 20, null),
];

const SESIONES: Record<string, unknown>[] = [];
const RESERVAS: Record<string, unknown>[] = [];
function vino(socio: string, inicio: string) {
  const id = `ses-${SESIONES.length + 1}`;
  SESIONES.push({
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio, fin: inicio.replace('T09:00', 'T10:00'), aforo_maximo: 8, cancelada: false,
  });
  RESERVAS.push({ id: `res-${RESERVAS.length + 1}`, studio_id: STUDIO_ID, sesion_id: id, socio_id: socio, estado: 'ASISTIDA', creado_en: inicio });
}
for (let s = 1; s <= 6; s++) { vino('s1', dia(s, 1)); vino('s1', dia(s, 3)); }
for (const s of [3, 4, 5, 6, 7, 8, 9]) vino('s2', dia(s, 2));
for (let s = 1; s <= 6; s++) vino('s5', dia(s, 4));

interface RespuestaInterruptores {
  status?: number;
  body?: unknown;
  /** Texto tal cual (JSON roto). */
  crudo?: string;
  /** La red se cae. */
  abortar?: boolean;
  retrasoMs?: number;
}

async function montar(page: Page, interruptores: RespuestaInterruptores = { body: {} }, opciones: { recepcion?: boolean } = {}) {
  const peticiones = { interruptores: 0 };
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/estudio/interruptores**', async route => {
    peticiones.interruptores++;
    if (interruptores.retrasoMs) await new Promise(r => setTimeout(r, interruptores.retrasoMs));
    if (interruptores.abortar) return route.abort('failed');
    if (interruptores.crudo !== undefined) {
      return route.fulfill({ status: interruptores.status ?? 200, contentType: 'application/json', body: interruptores.crudo });
    }
    return json(route, interruptores.body ?? {}, interruptores.status ?? 200);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  // Recepción: el estudio es de otra cuenta y la ficha del equipo con este usuario tiene rol RECEPCION.
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: opciones.recepcion ? 'otra-cuenta' : AUTH_UID }));
  if (opciones.recepcion) {
    await page.route('**/rest/v1/instructores**', route => json(route, [
      { id: 'ins-rec', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: AUTH_UID },
    ]));
  }
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/sesiones**', route => json(route, SESIONES));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  return peticiones;
}

const ENCENDIDO: RespuestaInterruptores = { body: { filtrosClientas: true } };
const CLAVE_SESION = `tentare-interruptores:${STUDIO_ID}`;
const guardadoEnLaPestana = (page: Page) => page.evaluate(k => sessionStorage.getItem(k), CLAVE_SESION);
const filas = (page: Page) => page.locator('tr[data-fila-clienta]');
const nombres = async (page: Page) => (await filas(page).locator('a[href^="/clientas/"]').allTextContents()).map(t => t.trim()).sort();

async function abrir(page: Page, ruta = '/clientas') {
  await page.goto(ruta);
  await expect(filas(page).first()).toBeVisible({ timeout: 30_000 });
}

test.describe('Clientas: filtros de cómo viene cada una (P2.8)', () => {
  test('apagado: Clientas es la de siempre aunque la URL traiga un filtro nuevo, y lo ha preguntado', async ({ page }) => {
    const peticiones = await montar(page);
    await abrir(page, '/clientas?frecuencia=ALTA&constancia=TODAS&sesiones=UNA_O_NINGUNA&mas=nunca_compro');
    await expect.poll(() => peticiones.interruptores).toBeGreaterThan(0);
    // La respuesta ya se ha aplicado (la pestaña la recuerda), no solo pedido:
    // apagado es también lo de antes de contestar.
    await expect.poll(() => guardadoEnLaPestana(page)).not.toBeNull();
    await expect(filas(page)).toHaveCount(TODAS);
    await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Constancia' })).toHaveCount(0);
    await expect(page.getByTestId('selector-columnas')).toHaveCount(0);
    const mas = page.getByRole('combobox', { name: 'Más filtros' });
    await expect(mas.locator('option', { hasText: 'Nunca ha comprado' })).toHaveCount(0);
    await expect(page.getByTestId('definiciones-filtros')).toHaveCount(0);
  });

  for (const [caso, respuesta] of [
    ['un 500', { status: 500, body: { error: 'x' } }],
    ['un 401 (sesión sin el segundo paso)', { status: 401, body: { error: 'No autorizado' } }],
    // La sede de la sesión cambió en otra pestaña: ni se enseña ni se recuerda (ni un «no» falso de 30 min).
    ['un 409 (la sede ha cambiado)', { status: 409, body: { error: 'La sede ha cambiado' } }],
    ['la red caída', { abortar: true }],
    ['un JSON roto', { crudo: '{"filtrosClientas": tr' }],
  ] as const) {
    test(`con ${caso}, apagado`, async ({ page }) => {
      const peticiones = await montar(page, respuesta);
      const contestado = page.waitForEvent(respuesta.abortar ? 'requestfailed' : 'requestfinished', r => r.url().includes('/api/estudio/interruptores'));
      await abrir(page, '/clientas?frecuencia=ALTA');
      await contestado;
      expect(peticiones.interruptores).toBeGreaterThan(0);
      // Que la respuesta llegue a aplicarse (un tick), no solo a pedirse.
      await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
      await expect(filas(page)).toHaveCount(TODAS);
      await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toHaveCount(0);
      expect(await guardadoEnLaPestana(page)).toBeNull();
    });
  }

  test('si el servidor tarda, el filtro de la URL espera y se aplica al contestar', async ({ page }) => {
    await montar(page, { ...ENCENDIDO, retrasoMs: 1_500 });
    await abrir(page, '/clientas?frecuencia=ALTA');
    await expect(page).toHaveURL(/frecuencia=ALTA/);
    await expect.poll(() => nombres(page), { timeout: 10_000 }).toEqual(['Ana Ruiz']);
    await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toHaveValue('ALTA');
  });

  test('móvil y apagado: un filtro nuevo en la URL no cuenta en «Filtros» ni pide «Quitar filtros»', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await montar(page);
    await page.goto('/clientas?mas=nunca_compro&frecuencia=ALTA');
    const boton = page.getByRole('button', { name: /^Filtros/ });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => guardadoEnLaPestana(page)).not.toBeNull();
    await expect(boton).toHaveText('Filtros');
    await expect(page.getByRole('button', { name: 'Quitar filtros' })).toHaveCount(0);
  });

  test('encendido: cada filtro enseña a quien dice, con su definición', async ({ page }) => {
    const peticiones = await montar(page, ENCENDIDO);
    await abrir(page);
    await expect.poll(() => peticiones.interruptores).toBeGreaterThan(0);
    const frecuencia = page.getByRole('combobox', { name: 'Frecuencia' });
    await expect(frecuencia).toBeVisible();

    await frecuencia.selectOption('ALTA');
    await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz']);
    await expect(page.getByTestId('definiciones-filtros')).toContainText('1,7 clases por semana o más.');
    await frecuencia.selectOption('MEDIA');
    await expect.poll(() => nombres(page)).toEqual(['Bea Soto', 'Eva Gil']);
    await frecuencia.selectOption('');

    const constancia = page.getByRole('combobox', { name: 'Constancia' });
    await constancia.selectOption('SIN_VENIR');
    await expect.poll(() => nombres(page)).toEqual(['Bea Soto']);
    await expect(page.getByTestId('definiciones-filtros')).toContainText('no en las 2 últimas semanas completas');
    await constancia.selectOption('TODAS');
    await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz', 'Eva Gil']);
    await constancia.selectOption('');

    const saldo = page.getByRole('combobox', { name: 'Le quedan' });
    await saldo.selectOption('UNA_O_NINGUNA');
    await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz']);
    await saldo.selectOption('CUATRO_O_MAS');
    await expect.poll(() => nombres(page)).toEqual(['Bea Soto']);
    await saldo.selectOption('');

    const mas = page.getByRole('combobox', { name: 'Más filtros' });
    await mas.selectOption('nunca_compro');
    // Fran (importada con historial) no: lo que compró allí no está aquí.
    await expect.poll(() => nombres(page)).toEqual(['Carla Vela', 'Dani Mora']);
    await expect(page.getByTestId('definiciones-filtros')).toContainText('La clase de prueba no cuenta como compra');
    await mas.selectOption('varios_planes');
    await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz']);

    // Se combinan, y «Quitar filtros» los quita todos.
    await mas.selectOption('');
    await frecuencia.selectOption('MEDIA');
    await constancia.selectOption('TODAS');
    await expect.poll(() => nombres(page)).toEqual(['Eva Gil']);
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(filas(page)).toHaveCount(TODAS);
    await expect(page.getByTestId('definiciones-filtros')).toHaveCount(0);
  });

  test('lo que dice el servidor se recuerda en la pestaña: volver no pregunta otra vez ni parpadea', async ({ page }) => {
    const peticiones = await montar(page, ENCENDIDO);
    await abrir(page);
    await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toBeVisible();
    await expect.poll(() => peticiones.interruptores).toBe(1);
    await page.reload();
    await expect(filas(page).first()).toBeVisible({ timeout: 30_000 });
    // Con la primera fila ya pintada, los filtros ya están: no aparecen después.
    await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toBeVisible({ timeout: 1_000 });
    expect(peticiones.interruptores).toBe(1);
  });

  test('el filtro va en la URL y sobrevive a recargar', async ({ page }) => {
    await montar(page, ENCENDIDO);
    await abrir(page);
    await page.getByRole('combobox', { name: 'Frecuencia' }).selectOption('ALTA');
    await expect(page).toHaveURL(/frecuencia=ALTA/);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Frecuencia' })).toHaveValue('ALTA');
    await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz']);
    // Un valor que no existe se ignora.
    await abrir(page, '/clientas?frecuencia=MUCHISIMA');
    await expect(filas(page)).toHaveCount(TODAS);
  });

  test('las columnas se eligen y se guardan para esta persona en este estudio', async ({ page }) => {
    await montar(page, ENCENDIDO);
    await abrir(page);
    const selector = page.getByTestId('selector-columnas');
    await selector.locator('summary').click();
    await selector.getByRole('checkbox', { name: 'Clases por semana' }).check();
    await selector.getByRole('checkbox', { name: 'Constancia' }).check();
    await expect(page.locator('th[data-columna-extra="frecuencia"]')).toHaveText('Clases por semana');
    const fila = filas(page).filter({ hasText: 'Bea Soto' });
    await expect(fila).toContainText('Lleva 2 semanas sin venir');
    await expect(filas(page).filter({ hasText: 'Ana Ruiz' })).toContainText('Todas las semanas');
    // Esc lo cierra (el <details> nativo no lo hace solo).
    await page.keyboard.press('Escape');
    await expect(selector.getByRole('checkbox', { name: 'Constancia' })).toBeHidden();

    const guardado = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tentare:clientas-columnas:')));
    expect(guardado).toEqual([`tentare:clientas-columnas:v1:${AUTH_UID}:${STUDIO_ID}`]);

    await page.reload();
    await expect(page.locator('th[data-columna-extra="frecuencia"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('th[data-columna-extra="constancia"]')).toBeVisible();
  });

  test('iPad: el panel de «Columnas» se abre dentro de la pantalla', async ({ page }) => {
    // Según cómo se parta la fila de filtros, el botón cae a un lado u otro:
    // anclado siempre al mismo, el panel se salía por el borde.
    await page.setViewportSize({ width: 820, height: 1180 });
    await montar(page, ENCENDIDO);
    await abrir(page);
    const selector = page.getByTestId('selector-columnas');
    await selector.locator('summary').click();
    const panel = selector.locator('fieldset');
    await expect(panel).toBeVisible();
    await expect.poll(async () => {
      const caja = await panel.boundingBox();
      return !!caja && caja.x >= 0 && caja.x + caja.width <= 820;
    }).toBe(true);
    await selector.getByRole('checkbox', { name: 'Clases por semana' }).check();
    await expect(page.locator('th[data-columna-extra="frecuencia"]')).toBeVisible();
  });

  test('móvil: los filtros nuevos van detrás de «Filtros» y no hay columnas', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await montar(page, ENCENDIDO);
    await page.goto('/clientas');
    const boton = page.getByRole('button', { name: /^Filtros/ });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();
    const frecuencia = page.getByRole('combobox', { name: 'Frecuencia' });
    await expect(frecuencia).toBeVisible();
    await frecuencia.selectOption('ALTA');
    await expect(boton).toContainText('1');
    await expect(page.getByTestId('selector-columnas')).toBeHidden();
  });
});

test('recepción: los mismos filtros y columnas', async ({ page }) => {
  await montar(page, ENCENDIDO, { recepcion: true });
  await abrir(page);
  await page.getByRole('combobox', { name: 'Frecuencia' }).selectOption('ALTA');
  await expect.poll(() => nombres(page)).toEqual(['Ana Ruiz']);
  const selector = page.getByTestId('selector-columnas');
  await selector.locator('summary').click();
  await selector.getByRole('checkbox', { name: 'Teléfono' }).check();
  await expect(page.locator('th[data-columna-extra="telefono"]')).toBeVisible();
});
