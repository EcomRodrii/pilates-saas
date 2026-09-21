import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Equipo → Tiempo trabajado», la vista de la propietaria sobre el fichaje:
//   · horas, jornadas y coste estimado por instructora, con lo que está por revisar;
//   · corregir exige motivo (sin él, ni se envía) y manda el instante en hora
//     del ESTUDIO, no la del navegador;
//   · si el servidor dice que no, se explica y no se pinta nada como guardado;
//   · el historial enseña quién cambió qué y por qué.
// La API está simulada: que el servidor filtra por rol y audita lo cubren las
// pruebas de `lib/fichaje/*.test.ts` y la migración, probada en PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// Martes 15 de septiembre de 2026, de 09:00 a 13:00 en Madrid (UTC+2).
const CERRADA = {
  id: 'j-1', instructorId: 'ins-marta', checkInAt: '2026-09-15T07:00:00.000Z', checkOutAt: '2026-09-15T11:00:00.000Z',
  status: 'CLOSED', minutos: 240, requiereRevision: false, corregida: true,
};
const OLVIDADA = {
  id: 'j-2', instructorId: 'ins-marta', checkInAt: '2026-09-16T07:00:00.000Z', checkOutAt: null,
  status: 'OPEN', minutos: null, requiereRevision: true, corregida: false,
};
const CAMBIOS = {
  'j-1': [
    { accion: 'CHECK_IN', campo: 'check_in_at', antes: null, despues: CERRADA.checkInAt, motivo: null, en: CERRADA.checkInAt, por: 'Marta Ruiz' },
    { accion: 'EDITED', campo: 'check_out_at', antes: '2026-09-15T10:00:00.000Z', despues: CERRADA.checkOutAt, motivo: 'Se quedó a una clase extra', en: '2026-09-15T12:00:00.000Z', por: 'Cloe' },
  ],
};

async function abrir(page: Page, opts: { patchResponde?: { status: number; body: unknown } } = {}) {
  const patches: Record<string, unknown>[] = [];
  const lecturas: string[] = [];
  let jornadas = [CERRADA, OLVIDADA];
  await montar(page);
  await page.route((u) => u.pathname === '/api/equipo/tarifas', (r) => json(r, {
    items: [{ instructorId: 'ins-marta', tarifaHora: 22, baseMensualEur: null, recargoSustitucionPct: null, horasSemanalesContrato: null }],
  }));
  await page.route((u) => u.pathname === '/api/equipo/jornadas', (r) => {
    if (r.request().method() === 'PATCH') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      patches.push(cuerpo);
      if (opts.patchResponde) return json(r, opts.patchResponde.body, opts.patchResponde.status);
      jornadas = jornadas.map((j) => (j.id === cuerpo.id
        ? { ...j, checkOutAt: String(cuerpo.checkOutAt), status: 'CLOSED', minutos: 600, requiereRevision: false, corregida: true }
        : j));
      return json(r, { ok: true, cambios: 2 });
    }
    lecturas.push(new URL(r.request().url()).search);
    const minutos = jornadas.reduce((s, j) => s + (j.minutos ?? 0), 0);
    return json(r, {
      jornadas, cambios: CAMBIOS,
      resumen: [{
        instructorId: 'ins-marta', minutos, jornadas: jornadas.length,
        abiertas: jornadas.filter((j) => j.status === 'OPEN').length,
        aRevisar: jornadas.filter((j) => j.requiereRevision).length,
      }],
    });
  });
  await ir(page, 'equipo/tiempo-trabajado');
  return { patches, lecturas };
}

const tarjeta = (page: Page) => page.getByTestId('tiempo-instructora').filter({ hasText: 'Marta Ruiz' });

test.describe('Tiempo trabajado del equipo', () => {
  test('horas, jornadas y coste por instructora, con lo que está por revisar', async ({ page }) => {
    const { lecturas } = await abrir(page);
    const t = tarjeta(page);
    await expect(t).toBeVisible({ timeout: 30_000 });
    await expect(t.getByTestId('horas-mes')).toHaveText('4 h 00 min');
    await expect(t).toContainText('88');
    await expect(t).toContainText('Fichada ahora');
    await expect(t).toContainText('1 jornada por revisar');
    expect(lecturas[0]).toMatch(/anio=\d{4}&mes=\d{1,2}/);

    await t.getByRole('button', { name: 'Ver 2 jornadas' }).click();
    await expect(t.getByTestId('jornada')).toHaveCount(2);
    await expect(t.getByTestId('jornada').first()).toContainText('09:00 – 13:00');
    await expect(t.getByTestId('jornada').first()).toContainText('Corregida');
    await expect(t.getByTestId('jornada').nth(1)).toContainText('sin salida');
    await expect(t.getByTestId('jornada').nth(1)).toContainText('Por revisar');
  });

  test('el historial dice quién cambió qué y por qué', async ({ page }) => {
    await abrir(page);
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 2 jornadas' }).click({ timeout: 30_000 });
    await t.getByTestId('jornada').first().getByRole('button', { name: 'Historial' }).click();
    const h = t.getByTestId('historial-jornada');
    await expect(h).toContainText('Fichó la entrada por Marta Ruiz');
    await expect(h).toContainText('Corregido por Cloe');
    await expect(h).toContainText('Salida');
    await expect(h).toContainText('«Se quedó a una clase extra»');
  });

  test('corregir exige motivo; con motivo manda el instante en hora de Madrid y recarga', async ({ page }) => {
    const { patches, lecturas } = await abrir(page);
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 2 jornadas' }).click({ timeout: 30_000 });
    const fila = t.getByTestId('jornada').nth(1);
    await fila.getByRole('button', { name: 'Corregir' }).click();
    await fila.getByLabel('Hora de salida').fill('19:00');

    await fila.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('Indica el motivo del cambio')).toBeVisible();
    expect(patches).toHaveLength(0);

    await fila.getByPlaceholder('Ej.: olvidó fichar la salida').fill('Olvidó fichar la salida');
    await fila.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('Jornada corregida')).toBeVisible();
    expect(patches).toHaveLength(1);
    // 19:00 del 16-sep en Madrid (UTC+2) = 17:00 UTC. Solo el campo que cambió.
    expect(patches[0]).toEqual({ id: 'j-2', checkOutAt: '2026-09-16T17:00:00.000Z', motivo: 'Olvidó fichar la salida' });
    expect(lecturas.length).toBeGreaterThanOrEqual(2);
    await expect(t).not.toContainText('por revisar');
  });

  test('si el servidor dice que no, se explica y no se da por guardada', async ({ page }) => {
    const { patches } = await abrir(page, { patchResponde: { status: 400, body: { error: 'La salida tiene que ser posterior a la entrada' } } });
    const t = tarjeta(page);
    await t.getByRole('button', { name: 'Ver 2 jornadas' }).click({ timeout: 30_000 });
    const fila = t.getByTestId('jornada').nth(1);
    await fila.getByRole('button', { name: 'Corregir' }).click();
    await fila.getByLabel('Hora de salida').fill('08:00');
    await fila.getByPlaceholder('Ej.: olvidó fichar la salida').fill('Prueba');
    await fila.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page.getByText('La salida tiene que ser posterior a la entrada')).toBeVisible();
    expect(patches.length).toBeGreaterThan(0);
    await expect(page.getByText('Jornada corregida')).toHaveCount(0);
    await expect(fila.getByRole('button', { name: 'Guardar corrección' })).toBeVisible();
    await expect(fila).toContainText('Por revisar');
  });

  test('en el móvil se lee sin salirse de lado', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page);
    const t = tarjeta(page);
    await expect(t).toBeVisible({ timeout: 30_000 });
    await t.getByRole('button', { name: 'Ver 2 jornadas' }).click();
    await t.getByTestId('jornada').nth(1).getByRole('button', { name: 'Corregir' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
