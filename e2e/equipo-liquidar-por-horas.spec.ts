import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Liquidaciones: el estudio elige si la parte variable se calcula por horas de
// clase (por defecto) o por horas fichadas.
//   · la propietaria lo cambia con un aviso previo; si el servidor dice que no,
//     el selector vuelve a lo que había;
//   · quien no es la propietaria lo ve, pero no lo puede cambiar;
//   · una liquidación por horas enseña lo fichado y, con jornadas sin cerrar,
//     avisa y no deja confirmar.
// API simulada: el cálculo y el bloqueo en servidor los cubre
// lib/equipo/liquidacion-horas-fichadas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const LIQ_HORAS = {
  id: 'liq-1', instructorId: 'ins-marta', periodoAnio: 2026, periodoMes: 9, baseEur: 0,
  nClasesPropias: 3, variablePropiasEur: 110, nClasesSustitucion: 1, variableSustitucionEur: 0,
  nPenalizaciones: 0, repartoPenalizacionesEur: 0, nClasesSinTarifa: 0, totalEur: 110,
  estado: 'BORRADOR', confirmadaEn: null, pagadaEn: null, referenciaPago: null, generadaEn: '2026-09-21T10:00:00.000Z',
  requiereRevision: false, revisionMotivo: null, modo: 'HORAS_FICHADAS', minutosFichados: 330, jornadasSinCerrar: 2,
};

async function abrir(page: Page, opts: { modo?: string; puedeCambiar?: boolean; putFalla?: boolean; liq?: Record<string, unknown> | null } = {}) {
  const puts: unknown[] = [];
  await montar(page);
  await page.route((u) => u.pathname === '/api/equipo/tarifas', (r) => json(r, { items: [] }));
  await page.route((u) => u.pathname === '/api/equipo/jornadas', (r) => json(r, { jornadas: [], cambios: {}, resumen: [] }));
  await page.route((u) => u.pathname === '/api/equipo/liquidaciones', (r) => json(r, { items: opts.liq === null ? [] : [opts.liq ?? LIQ_HORAS] }));
  await page.route((u) => u.pathname === '/api/equipo/liquidacion-modo', (r) => {
    if (r.request().method() === 'PUT') {
      puts.push(r.request().postDataJSON());
      return opts.putFalla ? json(r, { error: 'No se ha podido guardar el criterio.' }, 500) : json(r, { ok: true });
    }
    return json(r, { modo: opts.modo ?? 'CLASES', puedeCambiar: opts.puedeCambiar ?? true });
  });
  await ir(page, 'equipo/liquidaciones');
  return { puts };
}

const selector = (page: Page) => page.getByLabel('Calcular la parte variable por');

test.describe('Liquidar por horas fichadas', () => {
  test('la propietaria lo cambia tras un aviso, y se guarda solo lo que confirma el servidor', async ({ page }) => {
    const { puts } = await abrir(page, { liq: null });
    await expect(selector(page)).toHaveValue('CLASES', { timeout: 30_000 });

    // Si cancela el aviso, no se envía nada.
    page.once('dialog', (d) => { expect(d.message()).toContain('horas fichadas'); void d.dismiss(); });
    await selector(page).selectOption('HORAS_FICHADAS');
    await expect(selector(page)).toHaveValue('CLASES');
    expect(puts).toHaveLength(0);

    page.once('dialog', (d) => void d.accept());
    await selector(page).selectOption('HORAS_FICHADAS');
    await expect(page.getByText('Criterio guardado')).toBeVisible();
    await expect(selector(page)).toHaveValue('HORAS_FICHADAS');
    expect(puts).toEqual([{ modo: 'HORAS_FICHADAS' }]);
  });

  test('si el servidor no lo guarda, lo dice y el selector vuelve a lo que había', async ({ page }) => {
    const { puts } = await abrir(page, { putFalla: true, liq: null });
    await expect(selector(page)).toHaveValue('CLASES', { timeout: 30_000 });
    page.once('dialog', (d) => void d.accept());
    await selector(page).selectOption('HORAS_FICHADAS');
    await expect(page.getByText('No se ha podido guardar el criterio.')).toBeVisible();
    await expect(selector(page)).toHaveValue('CLASES');
    expect(puts.length).toBeGreaterThan(0);
  });

  test('quien no es la propietaria ve el criterio pero no lo puede cambiar', async ({ page }) => {
    await abrir(page, { modo: 'HORAS_FICHADAS', puedeCambiar: false, liq: null });
    await expect(page.getByTestId('criterio-liquidacion')).toContainText('horas fichadas', { timeout: 30_000 });
    await expect(selector(page)).toHaveCount(0);
  });

  test('una liquidación por horas enseña lo fichado; con jornadas sin cerrar avisa y no deja confirmar', async ({ page }) => {
    await abrir(page, { modo: 'HORAS_FICHADAS' });
    await expect(page.getByTestId('variable-fichado')).toContainText('5 h 30 min fichadas', { timeout: 30_000 });
    await expect(page.getByTestId('jornadas-sin-cerrar')).toContainText('2 jornadas de este mes sin cerrar');
    await expect(page.getByRole('link', { name: 'Tiempo trabajado' })).toHaveAttribute('href', '/equipo/tiempo-trabajado');
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await expect(page.getByText('clases propias')).toHaveCount(0);
  });

  test('sin jornadas pendientes se puede confirmar', async ({ page }) => {
    await abrir(page, { modo: 'HORAS_FICHADAS', liq: { ...LIQ_HORAS, jornadasSinCerrar: 0 } });
    await expect(page.getByTestId('variable-fichado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('jornadas-sin-cerrar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });
});
