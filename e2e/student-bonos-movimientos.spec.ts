import { test, expect, type Page, type Route } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, type OpcionesSocia } from './socia-completa';

// Bonos (P4-D y E, 5-oct-2026): los movimientos del bono, del ledger (`POST /api/public/mis-bonos`), y «Esta semana» de
// una cuota con tope. Con CONTADOR de peticiones en cada camino de fallo: «no dijo 0 de 2» puede ser verdad por no haber
// preguntado nada.

test.describe.configure({ timeout: 150_000 });

const BONOS = `/portal/${SLUG}/bonos`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

const MOVIMIENTOS = [
  { id: '00000000-0000-4000-8000-000000000003', clase: 'consumo', delta: -1, saldoDespues: 5, fecha: '2026-08-10T09:00:00Z', claseInfo: { nombre: 'Reformer', inicio: '2026-08-11T08:00:00Z', fecha: '2026-08-11' }, estadoReserva: 'ASISTIDA', canceladaTarde: null, claseCancelada: false },
  { id: '00000000-0000-4000-8000-000000000002', clase: 'devolucion', delta: 1, saldoDespues: 6, fecha: '2026-08-08T09:00:00Z', claseInfo: { nombre: 'Reformer', inicio: '2026-08-09T08:00:00Z', fecha: '2026-08-09' }, estadoReserva: 'CANCELADA', canceladaTarde: false, claseCancelada: false },
  { id: '00000000-0000-4000-8000-000000000001', clase: 'compra', delta: 8, saldoDespues: 8, fecha: '2026-08-01T09:00:00Z' },
];

/** El andamiaje y, DESPUÉS, el mock propio de mis-bonos (gana la última ruta registrada), con su contador. */
async function montar(page: Page, o: OpcionesSocia, responder: (cuerpo: Record<string, unknown>, r: Route) => Promise<void> | void) {
  const a = await sembrarSociaCompleta(page, { relojMadrid: true, ...o });
  const cuerpos: Record<string, unknown>[] = [];
  await page.route('**/api/public/mis-bonos', async (r) => {
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    cuerpos.push(cuerpo);
    await responder(cuerpo, r);
  });
  return { a, cuerpos };
}

test('el bono enseña sus movimientos, con por qué entró o salió cada sesión', async ({ page }) => {
  const { a, cuerpos } = await montar(page, { bono: 5 }, (_c, r) => r.fulfill(json({
    movimientos: { movimientos: MOVIMIENTOS, hayMas: false, cuadra: true, historialCompleto: true, desde: '2026-08-01T09:00:00Z' }, semanas: [],
  })));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  const lista = page.getByTestId('movimientos-bono');
  await expect(lista.getByTestId('movimiento')).toHaveCount(3, { timeout: 60_000 });
  await expect(lista).toContainText('Reformer · mar 11 ago');
  await expect(lista).toContainText('Fuiste');
  await expect(lista).toContainText('Devuelta: reserva cancelada a tiempo');
  await expect(lista).toContainText('Bono activado');
  await expect(lista).not.toContainText(/Compraste/);
  expect(cuerpos.length).toBeGreaterThan(0);
  expect(cuerpos[0]).toMatchObject({ slug: SLUG, bono: 'sus-1', limite: 4 });
  await expect(lista.getByRole('link', { name: 'Ver todo' })).toHaveAttribute('href', `${BONOS}/sus-1`);
  expect(a.sinMockear()).toEqual([]);
});

test('si mis-bonos falla, se dice; nunca «Aún no hay movimientos»', async ({ page }) => {
  const { cuerpos } = await montar(page, { bono: 5 }, (_c, r) => r.fulfill(json({ error: 'fallo' }, 500)));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('movimientos-error')).toBeVisible({ timeout: 60_000 });
  expect(cuerpos.length).toBeGreaterThan(0);
  await expect(page.getByTestId('movimientos-vacio')).toHaveCount(0);
  // El saldo, que sale del payload, sigue ahí.
  await expect(page.getByTestId('bono-restantes').first()).toHaveText('5');
});

test('si el saldo no cuadra con el ledger, se avisa de que manda el saldo', async ({ page }) => {
  const { cuerpos } = await montar(page, { bono: 5 }, (_c, r) => r.fulfill(json({
    movimientos: { movimientos: MOVIMIENTOS.slice(0, 1), hayMas: false, cuadra: false, historialCompleto: false, desde: '2026-08-02T09:00:00Z' }, semanas: [],
  })));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('movimientos-no-cuadra')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('movimientos-bono')).toContainText('Apuntamos cada movimiento desde el dom 2 ago');
  expect(cuerpos.length).toBeGreaterThan(0);
});

test('el detalle enseña la lista entera y «Ver más» pide la página siguiente con el cursor', async ({ page }) => {
  const { cuerpos } = await montar(page, { bono: 5 }, (c, r) => r.fulfill(json({
    movimientos: c.antes
      ? { movimientos: [{ ...MOVIMIENTOS[2], id: '00000000-0000-4000-8000-000000000000', clase: 'apertura', delta: 6, fecha: '2026-07-30T09:00:00Z' }], hayMas: false, cuadra: true, historialCompleto: true, desde: null }
      : { movimientos: MOVIMIENTOS, hayMas: true, cuadra: true, historialCompleto: true, desde: null },
    semanas: [],
  })));
  await page.goto(`${BONOS}/sus-1`, { waitUntil: 'domcontentloaded' });
  const lista = page.getByTestId('movimientos-bono');
  await expect(lista.getByTestId('movimiento')).toHaveCount(3, { timeout: 60_000 });
  await lista.getByRole('button', { name: 'Ver más' }).click();
  await expect(lista.getByTestId('movimiento')).toHaveCount(4);
  await expect(lista).toContainText('El 30 jul tenías 6');
  const conCursor = cuerpos.find((c) => c.antes);
  expect(conCursor?.antes).toEqual({ creadoEn: MOVIMIENTOS[2].fecha, id: MOVIMIENTOS[2].id });
  await expect(lista.getByRole('button', { name: 'Ver más' })).toHaveCount(0);
});

test('cuota con tope: «Esta semana 2 de 2» cuenta también la de recuperación, y lo dice', async ({ page }) => {
  const { a, cuerpos } = await montar(page, { bono: null, cuota: { limiteSemanal: 2 } }, (c, r) => r.fulfill(json({
    movimientos: null,
    semanas: (c.semanaDe as string[]).map((id) => ({ suscripcionId: id, limite: 2, cuentan: 2, conRecuperacion: 1, porTipo: [], desde: '2026-08-09T22:00:00.000Z', hasta: '2026-08-16T22:00:00.000Z' })),
  })));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  const semana = page.getByTestId('cuota-semana');
  await expect(semana.getByTestId('semana-cifra')).toHaveText('2 de 2', { timeout: 60_000 });
  await expect(semana).toContainText('2 clases a la semana');
  await expect(semana).toContainText('1 de ellas, con recuperación');
  expect(cuerpos.some((c) => (c.semanaDe as string[] | undefined)?.includes('sus-mes'))).toBe(true);
  // Una cuota no tiene movimientos de sesiones.
  await expect(page.getByTestId('movimientos-bono')).toHaveCount(0);
  expect(a.sinMockear()).toEqual([]);
});

test('si no se puede contar la semana, se dice; nunca un «0 de 2»', async ({ page }) => {
  const { cuerpos } = await montar(page, { bono: null, cuota: { limiteSemanal: 2 } }, (_c, r) => r.fulfill(json({ error: 'fallo' }, 500)));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('cuota-semana')).toContainText('No hemos podido contar tu semana', { timeout: 60_000 });
  expect(cuerpos.length).toBeGreaterThan(0);
  await expect(page.getByText(/0 de 2/)).toHaveCount(0);
});

test('una cuota sin tope no pregunta nada ni pinta la semana', async ({ page }) => {
  const { a, cuerpos } = await montar(page, { bono: null, cuota: true }, (_c, r) => r.fulfill(json({ movimientos: null, semanas: [] })));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('bono-restantes').or(page.getByText('Clases sin límite')).first()).toBeVisible();
  await expect(page.getByTestId('cuota-semana')).toHaveCount(0);
  expect(cuerpos).toEqual([]);
  expect(a.sinMockear()).toEqual([]);
});
