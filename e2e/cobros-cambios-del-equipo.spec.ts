import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Cambios del equipo»: el historial de cambios de dinero (auditoria_estudio).
//
// La propietaria ve quién creó, cambió o borró un recibo, una cuota o un plan, y
// el valor de antes. Solo ella: recepción mueve dinero pero no lee el registro.
// El libro lo rellena un trigger en la base de datos; aquí se prueba la
// pantalla con la red simulada, así que NO prueba el trigger (eso se midió
// contra producción con una transacción revertida).
//
// Cada «no debe pasar» lleva su contador de «sí se intentó» (ver
// .claude/tentare-os.md): un test de camino de fallo sin él es hueco.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const AUTH_UID = 'auth-e2e-duena';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function fila(id: number, o: Record<string, unknown> = {}) {
  return {
    id, studio_id: STUDIO_ID, ocurrido_en: '2026-09-25T12:32:00+00:00',
    actor_uid: 'auth-e2e-recepcion', actor_rol: 'RECEPCION', origen: 'panel',
    tabla: 'recibos', fila_id: `rec-${id}`, operacion: 'UPDATE', socio_id: 'soc-1',
    cambios: ['importe'], contexto: { concepto: 'Mensual Ilimitado — Jul 2026', fecha_vencimiento: '2026-07-01' },
    antes: { importe: 85 }, despues: { importe: 86 },
    ...o,
  };
}

const CAMBIOS = [
  fila(5),
  // Un descuento de UNA sesión de un bono: ruido diario, oculto por defecto.
  fila(4, {
    tabla: 'suscripciones', cambios: ['sesiones_restantes'], contexto: { plan_id: 'plan-1', estado: 'ACTIVA' },
    antes: { sesiones_restantes: 5 }, despues: { sesiones_restantes: 4 },
  }),
  fila(3, {
    actor_uid: AUTH_UID, actor_rol: 'PROPIETARIO', operacion: 'DELETE', socio_id: 'soc-2',
    cambios: null, contexto: { concepto: 'Clase suelta' },
    antes: { concepto: 'Clase suelta', importe: 12, estado: 'PENDIENTE' }, despues: null,
  }),
  fila(2, {
    tabla: 'ingresos_manuales', operacion: 'INSERT', socio_id: null, cambios: null,
    contexto: { concepto: 'Taller de verano' }, antes: null, despues: { concepto: 'Taller de verano', total: 300 },
  }),
  fila(1, {
    tabla: 'planes_tarifa', socio_id: null, cambios: ['precio'], contexto: { nombre: 'Bono 8' },
    antes: { precio: 45 }, despues: { precio: 50 },
  }),
];

/** Lo que pidió cada petición a `auditoria_estudio`, para poder contarlas y mirarlas. */
interface Peticiones { urls: URL[] }

async function montarPanel(page: Page, opts: {
  rol?: 'PROPIETARIO' | 'RECEPCION';
  responder?: (url: URL, n: number) => { status?: number; body: unknown };
} = {}): Promise<Peticiones> {
  const { rol = 'PROPIETARIO', responder } = opts;
  await montar(page);
  const p: Peticiones = { urls: [] };

  // Playwright resuelve en orden INVERSO al de registro: esto va DESPUÉS de
  // `montar` para que el comodín `**/rest/v1/**` de ahí no lo tape.
  await page.route('**/rest/v1/auditoria_estudio**', route => {
    const url = new URL(route.request().url());
    p.urls.push(url);
    const r = responder ? responder(url, p.urls.length) : { body: filtrar(url) };
    return json(route, r.body, r.status ?? 200);
  });

  // El libro guarda la cuenta, no el nombre: «Lucía» sale de la plantilla del equipo.
  const lucia = { id: 'ins-lucia', studio_id: STUDIO_ID, nombre: 'Lucía', activo: true, rol: 'RECEPCION', auth_user_id: 'auth-e2e-recepcion' };
  await page.route('**/rest/v1/instructores**', route => json(route, [lucia]));

  if (rol === 'RECEPCION') {
    // Con rol RECEPCION la dueña del estudio es OTRA persona: es lo que hace que
    // `useRol` no devuelva PROPIETARIO.
    await page.route('**/rest/v1/studios**', route => json(route, {
      id: STUDIO_ID, nombre: 'Studio Test', slug: 'studio-test', owner_auth_user_id: 'auth-otra-persona', moneda: 'EUR',
    }));
    await page.route('**/rest/v1/instructores**', route => json(route, [
      { id: 'ins-recep', studio_id: STUDIO_ID, nombre: 'Lucía', activo: true, rol: 'RECEPCION', auth_user_id: AUTH_UID },
    ]));
  }
  return p;
}

/** Hace lo que haría PostgREST con los filtros que pide la pantalla. */
function filtrar(url: URL) {
  const tabla = url.searchParams.get('tabla')?.replace('eq.', '');
  const socio = url.searchParams.get('socio_id')?.replace('eq.', '');
  const antesDe = Number(url.searchParams.get('id')?.replace('lt.', '') ?? Infinity);
  return CAMBIOS
    .filter(c => (!tabla || c.tabla === tabla) && (!socio || c.socio_id === socio) && c.id < antesDe)
    .sort((a, b) => b.id - a.id);
}

const items = (page: Page) => page.getByTestId('cambio-de-dinero');

test.describe('Cobros · «Cambios del equipo»', () => {
  test('la propietaria ve quién tocó qué, con el valor de antes, y los descuentos de sesión quedan aparte', async ({ page }) => {
    const p = await montarPanel(page);
    await ir(page, 'cobros?tab=historial');

    await expect(page.getByRole('button', { name: 'Cambios del equipo' })).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
    await expect(items(page)).toHaveCount(4);
    expect(p.urls.length, 'la pantalla no llegó a pedir el historial').toBeGreaterThan(0);

    const recibo = items(page).filter({ hasText: 'Cambió un recibo' });
    await expect(recibo).toContainText('Mensual Ilimitado — Jul 2026');
    await expect(recibo).toContainText('Lucía · Recepción');
    await expect(recibo).toContainText('María García Fernández');
    await expect(recibo).toContainText('Importe:');
    await expect(recibo).toContainText('85,00 €');
    await expect(recibo).toContainText('86,00 €');

    // La propietaria sin ficha de equipo sale por su rol, y una baja enseña lo que había.
    const baja = items(page).filter({ hasText: 'Eliminó un recibo' });
    await expect(baja).toContainText('Propietaria');
    await expect(baja).toContainText('Clase suelta');
    await expect(baja).toContainText('12,00 €');

    await expect(items(page).filter({ hasText: 'Creó un ingreso manual' })).toContainText('300,00 €');
    await expect(items(page).filter({ hasText: 'Cambió un plan' })).toContainText('Bono 8');
    // Dice de qué NO habla, para que su ausencia no se lea como «no ha pasado».
    await expect(page.getByText(/No incluye los cobros automáticos, lo que confirma Stripe, ni todavía los ingresos manuales, los reembolsos y las devoluciones\./)).toBeVisible();
    // Los ingresos manuales no se auditan desde el panel, así que no hay filtro que prometa lo contrario.
    await expect(page.getByRole('button', { name: 'Ingresos manuales', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Planes', exact: true })).toBeVisible();

    // El descuento de una sesión no sale, pero se sabe que existe y se puede ver.
    await expect(page.getByText('Sesiones restantes')).toHaveCount(0);
    await expect(page.getByText('(1 ocultos)')).toBeVisible();
    await page.getByLabel(/Mostrar también los descuentos de sesión/).check();
    await expect(items(page)).toHaveCount(5);
    await expect(page.getByText('Sesiones restantes:')).toBeVisible();
  });

  test('filtrar por tipo pide solo esa tabla', async ({ page }) => {
    const p = await montarPanel(page);
    await ir(page, 'cobros?tab=historial');
    await expect(items(page)).toHaveCount(4, { timeout: 30_000 });

    const antes = p.urls.length;
    await page.getByRole('button', { name: 'Planes', exact: true }).click();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText('Cambió un plan');
    expect(p.urls.length, 'el filtro no pidió nada').toBeGreaterThan(antes);
    expect(p.urls.at(-1)!.searchParams.get('tabla')).toBe('eq.planes_tarifa');
  });

  test('recepción no ve la pestaña, ni entrando por el enlace, ni llega a pedir nada', async ({ page }) => {
    const p = await montarPanel(page, { rol: 'RECEPCION' });
    await ir(page, 'cobros?tab=historial');

    // La pantalla cargó de verdad (si no, «no hay pestaña» pasaría por no haber pintado nada).
    await expect(page.getByRole('button', { name: 'Quién me debe' })).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Facturas' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambios del equipo' })).toHaveCount(0);
    await expect(page.getByTestId('historial-dinero')).toHaveCount(0);
    expect(p.urls, 'recepción pidió el historial').toHaveLength(0);
  });

  test('sin cambios registrados lo dice, y dice desde cuándo cuenta', async ({ page }) => {
    const p = await montarPanel(page, { responder: () => ({ body: [] }) });
    await ir(page, 'cobros?tab=historial');
    await expect(page.getByText('No hay cambios registrados', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Desde hoy, lo que haga tu equipo con el dinero/)).toBeVisible();
    expect(p.urls.length).toBeGreaterThan(0);
  });

  test('si el servidor dice que no, se ve el error y «Reintentar» lo vuelve a pedir', async ({ page }) => {
    const p = await montarPanel(page, {
      responder: (_url, n) => (n === 1 ? { status: 500, body: { message: 'boom' } } : { body: filtrar(new URL('http://x/')) }),
    });
    await ir(page, 'cobros?tab=historial');
    await expect(page.getByTestId('historial-dinero').getByRole('alert')).toContainText('No se ha podido cargar el historial.', { timeout: 30_000 });
    expect(p.urls.length).toBe(1);
    await expect(items(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(items(page)).toHaveCount(4);
    expect(p.urls.length, 'Reintentar no volvió a pedir').toBe(2);
  });

  test('pagina de 50 en 50 por id, sin saltarse ninguna', async ({ page }) => {
    const todas = Array.from({ length: 53 }, (_, i) => fila(60 - i, { fila_id: `rec-${60 - i}` }));
    const p = await montarPanel(page, {
      responder: url => {
        const antesDe = Number(url.searchParams.get('id')?.replace('lt.', '') ?? Infinity);
        // La pantalla pide 51 para saber si hay más.
        return { body: todas.filter(t => t.id < antesDe).slice(0, Number(url.searchParams.get('limit'))) };
      },
    });
    await ir(page, 'cobros?tab=historial');
    await expect(items(page)).toHaveCount(50, { timeout: 30_000 });
    expect(p.urls[0].searchParams.get('limit')).toBe('51');

    await page.getByRole('button', { name: 'Ver más antiguos' }).click();
    await expect(items(page)).toHaveCount(53);
    // La segunda página empieza justo después de la última que ya se veía (id 11).
    expect(p.urls[1].searchParams.get('id')).toBe('lt.11');
    await expect(page.getByRole('button', { name: 'Ver más antiguos' })).toHaveCount(0);
  });
});

test.describe('Ficha de la clienta · «Cambios de dinero en esta ficha»', () => {
  test('la propietaria ve solo lo de esa clienta, sin repetirle su nombre en cada fila', async ({ page }) => {
    const p = await montarPanel(page);
    await ir(page, 'clientas/soc-1');
    await page.getByRole('button', { name: 'Pagos', exact: true }).click();

    await expect(page.getByRole('region', { name: 'Cambios de dinero en esta ficha' })).toBeVisible({ timeout: 30_000 });
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText('Cambió un recibo');
    await expect(items(page).first()).not.toContainText('María García Fernández');
    // Sin filtros de tipo: son pocas filas de una sola persona.
    await expect(page.getByRole('group', { name: 'Filtrar por tipo' })).toHaveCount(0);
    expect(p.urls.length).toBeGreaterThan(0);
    expect(p.urls.every(u => u.searchParams.get('socio_id') === 'eq.soc-1'), 'pidió filas de otra clienta').toBe(true);
  });

  test('recepción abre la misma ficha y no ve la sección, ni la pide', async ({ page }) => {
    const p = await montarPanel(page, { rol: 'RECEPCION' });
    await ir(page, 'clientas/soc-1');
    await page.getByRole('button', { name: 'Pagos', exact: true }).click();

    // La pestaña de pagos cargó (recepción sí ve el dinero)...
    await expect(page.getByRole('button', { name: 'Nuevo cobro' })).toBeVisible({ timeout: 30_000 });
    // ...y de la auditoría no hay ni rastro.
    await expect(page.getByRole('region', { name: 'Cambios de dinero en esta ficha' })).toHaveCount(0);
    expect(p.urls, 'recepción pidió el historial').toHaveLength(0);
  });
});
