import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Quién me debe» en el panel nuevo (interruptor `panelNuevo`), como «Pagos
// pendientes» de Bonsai: la casilla de cada clienta siempre a la vista,
// «Seleccionar todo», lo seleccionado con su importe y «Marcar N como cobrado»
// en la cabecera, que pregunta cómo han pagado y pasa por la MISMA confirmación
// de siempre (dialogo-cobro-en-lote). Las garantías de cobros-masivo.spec.ts se
// repiten aquí: nada marcado al abrir, nada cobrado sin confirmar, lo que dice el
// servidor es lo que se cuenta, y ni una escritura directa a `rest/v1/recibos`.
// El montaje es el de esa suite, con el interruptor encendido.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const SOCIAS = [
  { id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
  { id: 's2', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'López', email: 'bea@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] },
];

const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true },
];

const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
  { id: 'sus-2', studio_id: STUDIO_ID, socio_id: 's2', plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-07-01', fecha_fin: '2026-08-01', sesiones_restantes: null, stripe_subscription_id: null },
];

const RECIBOS = [
  { id: 'rec-1', studio_id: STUDIO_ID, socio_id: 's1', suscripcion_id: 'sus-1', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null, es_renovacion: true },
  { id: 'rec-2', studio_id: STUDIO_ID, socio_id: 's2', suscripcion_id: 'sus-2', concepto: 'Renovación Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-07-20', fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null, es_renovacion: true },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Contadores {
  /** Cuerpos de los POST a /api/cobros/marcar-cobrado. */
  cobros: { reciboIds: string[]; metodo: string | null; lote?: boolean }[];
  /** Cualquier escritura directa a `rest/v1/recibos` desde el navegador. Tiene que ser 0. */
  escriturasDirectas: number;
}

async function montarCobros(
  page: Page,
  suscripciones: unknown[] = SUSCRIPCIONES,
  opts: { rechazar?: boolean; recibos?: unknown[] } = {},
): Promise<Contadores> {
  const c: Contadores = { cobros: [], escriturasDirectas: 0 };

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
  // «Primeros pasos» flotante, plegado (como lo deja la dueña con su X): con el
  // estudio a medio montar ocupa la esquina y taparía la cabecera de la lista.
  await page.addInitScript(() => { try { localStorage.setItem('tentare-primeros-pasos-plegado', '1'); } catch { /* sin almacenamiento */ } });

  // Comodines primero: Playwright resuelve las rutas en orden inverso.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route(u => u.pathname === '/api/estudio/interruptores', route => json(route, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = JSON.parse(route.request().postData() ?? '{}') as { reciboIds: string[]; metodo: string | null; lote?: boolean };
    c.cobros.push(cuerpo);
    // Simula que el servidor rechaza antes de tocar nada (sesión, rol): el camino
    // que antes se tragaba en silencio y aun así pintaba facturas y renovaciones.
    if (opts.rechazar) return json(route, { error: 'Tu rol no puede registrar cobros' }, 403);
    return json(route, {
      resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })),
    });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, suscripciones));
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() !== 'GET') {
      c.escriturasDirectas++;
      return json(route, { message: 'el panel no debería escribir recibos directamente' }, 400);
    }
    return json(route, opts.recibos ?? RECIBOS);
  });

  await page.goto('/cobros');
  return c;
}


const lista = (page: Page) => page.getByRole('region', { name: 'Quién me debe' });

test.describe('Marcar como cobrado varias a la vez (panel nuevo)', () => {
  test('abre sin nada marcado, con la casilla de cada clienta a la vista', async ({ page }) => {
    await montarCobros(page);
    await expect(lista(page).getByRole('button', { name: 'Marcar a Ana Ruiz' })).toBeVisible({ timeout: 30_000 });
    await expect(lista(page).getByRole('button', { name: 'Marcar a Bea López' })).toHaveAttribute('aria-pressed', 'false');
    await expect(lista(page).getByRole('button', { name: 'Marcar como cobrado' })).toBeDisabled();
    // «Seleccionar varias» ya no hace falta: las casillas están.
    await expect(page.getByRole('button', { name: 'Seleccionar varias' })).toHaveCount(0);
  });

  test('marcar una casilla no abre su ficha, y «Seleccionar todo» suma lo de todas', async ({ page }) => {
    await montarCobros(page);
    await lista(page).getByRole('button', { name: 'Marcar a Ana Ruiz' }).click({ timeout: 30_000 });
    await expect(page.getByRole('complementary', { name: /^Ficha de / })).toHaveCount(0);
    await expect(lista(page)).toContainText('1 seleccionada');
    await lista(page).getByRole('button', { name: 'Seleccionar todo' }).click();
    await expect(lista(page)).toContainText('2 seleccionadas');
    await expect(lista(page)).toContainText('120,00 €');
  });

  test('no cobra nada sin elegir cómo han pagado y confirmar; volver atrás no pierde lo marcado', async ({ page }) => {
    const c = await montarCobros(page);
    await lista(page).getByRole('button', { name: 'Seleccionar todo' }).click({ timeout: 30_000 });
    await lista(page).getByRole('button', { name: 'Marcar 2 como cobrado' }).click();
    await page.getByRole('menuitem', { name: 'Tarjeta' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await expect(dialogo).toContainText('Vas a cobrar 2 recibos');
    await expect(dialogo).toContainText('Te han pagado con tarjeta');
    await expect(dialogo).toContainText('Esto no se puede deshacer');
    expect(c.cobros).toHaveLength(0);
    await dialogo.getByRole('button', { name: 'Volver a la lista' }).click();
    await expect(lista(page)).toContainText('2 seleccionadas');
    expect(c.cobros).toHaveLength(0);
    expect(c.escriturasDirectas).toBe(0);
  });

  test('si el servidor rechaza, lo dice y no da los cobros por buenos', async ({ page }) => {
    const c = await montarCobros(page, SUSCRIPCIONES, { rechazar: true });
    await lista(page).getByRole('button', { name: 'Seleccionar todo' }).click({ timeout: 30_000 });
    await lista(page).getByRole('button', { name: 'Marcar 2 como cobrado' }).click();
    await page.getByRole('menuitem', { name: 'Efectivo' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();
    await expect(dialogo).toContainText('0 cobros guardados', { timeout: 15_000 });
    expect(c.cobros.length, 'el cobro no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
    await expect(dialogo).toContainText('no se han podido guardar');
    expect(c.escriturasDirectas).toBe(0);
  });

  test('si el servidor acepta, se cobra con el método elegido, como lote, y la selección se vacía', async ({ page }) => {
    const c = await montarCobros(page);
    await lista(page).getByRole('button', { name: 'Seleccionar todo' }).click({ timeout: 30_000 });
    await lista(page).getByRole('button', { name: 'Marcar 2 como cobrado' }).click();
    await page.getByRole('menuitem', { name: 'Bizum' }).click();
    const dialogo = page.getByTestId('dialogo-cobro-en-lote');
    await dialogo.getByRole('button', { name: /^Sí, cobrar/ }).click();
    await expect(dialogo).toContainText('2 cobros guardados', { timeout: 15_000 });
    expect(c.cobros.length).toBeGreaterThan(0);
    expect(c.cobros.every(x => x.metodo === 'BIZUM' && x.lote === true), JSON.stringify(c.cobros)).toBe(true);
    expect(c.cobros.flatMap(x => x.reciboIds).sort()).toEqual(['rec-1', 'rec-2']);
    expect(c.escriturasDirectas).toBe(0);
  });
});
