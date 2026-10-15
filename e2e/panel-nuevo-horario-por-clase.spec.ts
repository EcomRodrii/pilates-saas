import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Calendario › Horario «Por clase» con el panel nuevo: cada día con su cabecera,
// cada clase con el color de su tipo, los puntos de aforo legibles y «termina en
// N días» en una chapa que se ve. Los textos, los nombres accesibles y las
// acciones son los de siempre (los 8 de `calendario-horario.spec.ts` siguen
// probando la vista sin el panel nuevo). Mismos datos que ese spec.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const TZ = 'Europe/Madrid';
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const enDias = (n: number) => {
  const [a, m, d] = ymdMadrid(new Date()).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

const NOMBRE = 'Reformer · Martes 18:00 · Sala Reformer';
const tarjeta = (o: Record<string, unknown> = {}) => ({
  serieId: 'serie-e2e', diaSemana: 2, hora: '18:00', duracionMin: 50, salaId: 'sala-1', tipoClaseId: 'tc-reformer',
  instructorId: 'ins-marta', aforo: 6, proximaSesionId: 'ses-lejana', proximaInicio: new Date(Date.now() + 86_400_000).toISOString(),
  ultimaFecha: enDias(12), clasesFuturas: 2, renovacionAutomatica: false, noRenovar: false,
  plazasFijas: [{ id: 'pf-1', socioId: 'soc-1', enPausa: false }, { id: 'pf-2', socioId: 'soc-2', enPausa: true }],
  ...o,
});
const HORARIO = {
  ok: true,
  dias: [
    { diaSemana: 1, tarjetas: [tarjeta({ serieId: 'serie-lunes', diaSemana: 1, hora: '09:30', tipoClaseId: 'tc-mat', ultimaFecha: enDias(200), renovacionAutomatica: true, plazasFijas: [] })] },
    { diaSemana: 2, tarjetas: [tarjeta()] },
  ],
  huerfanas: [],
};

async function abrir(page: Page, horario: unknown = HORARIO) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route('**/api/calendario/horario', (r) => json(r, horario));
  await page.route('**/api/series/renovar', (r) => json(r, { ok: true, series: [] }));
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
}

test('cada día con su cabecera y cada clase con lo de siempre: aforo, clase fija, hasta cuándo y sus acciones', async ({ page }) => {
  await abrir(page);
  const resumen = page.getByTestId('resumen-horario');
  await expect(resumen).toBeVisible({ timeout: 30_000 });
  await expect(resumen.getByText('2 clases que se repiten')).toBeVisible();
  await expect(resumen.getByText('2 clases fijas')).toBeVisible();
  await expect(resumen.getByText('1 termina en menos de un mes')).toBeVisible();

  const martes = page.getByRole('region', { name: 'Martes' });
  await expect(martes.getByRole('heading', { name: 'Martes' })).toBeVisible();
  await expect(martes.getByText('1 clase', { exact: true })).toBeVisible();
  const clase = martes.getByRole('listitem', { name: NOMBRE });
  await expect(clase.getByText('1/6 con clase fija · 1 en pausa')).toBeVisible();
  await expect(clase.getByText(`Hasta el ${dmy(enDias(12))} · termina en 12 días`)).toBeVisible();
  await expect(clase.getByRole('button', { name: `Renovar ${NOMBRE}` })).toBeVisible();
  await expect(clase.getByRole('button', { name: `Añadir clase fija en ${NOMBRE}` })).toBeVisible();
  await expect(clase.getByRole('button', { name: `Ver la próxima clase de ${NOMBRE}` })).toBeVisible();

  const lunes = page.getByRole('listitem', { name: /^Mat · Lunes 09:30/ });
  await expect(lunes.getByText(`Hasta el ${dmy(enDias(200))} · se renueva sola`)).toBeVisible();
  // El color de su tipo, en el borde, como los bloques del Calendario.
  const borde = await clase.evaluate((el) => getComputedStyle(el).borderLeftWidth);
  expect(borde).toBe('4px');
});

test('«Renovar» desde la tarjeta abre el mismo diálogo', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: `Renovar ${NOMBRE}` }).click({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('sin clases que se repitan, el vacío enseña qué saldrá aquí y deja crear la primera', async ({ page }) => {
  await abrir(page, { ok: true, dias: [], huerfanas: [] });
  const vacia = page.locator('section').filter({ has: page.getByText('Ejemplos', { exact: true }) });
  await expect(vacia.getByRole('heading', { name: 'Tu semana, siempre igual' })).toBeVisible({ timeout: 30_000 });
  await expect(vacia.getByRole('listitem')).toHaveCount(3);
  await expect(vacia.getByRole('button', { name: 'Crear clase recurrente' })).toBeVisible();
});

// Fuera del run normal: `E2E_CAPTURAS=1` (y `E2E_CAPTURAS_DIR`, por defecto test-results).
test.describe('capturas', () => {
  test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar la pantalla');
  const OUT = process.env.E2E_CAPTURAS_DIR ?? 'test-results';
  for (const [ancho, alto, oscuro] of [[1440, 900, false], [1440, 900, true], [375, 812, false]] as const) {
    test(`Horario por clase a ${ancho}${oscuro ? ' en oscuro' : ''}`, async ({ page }) => {
      if (oscuro) await enOscuro(page);
      await page.setViewportSize({ width: ancho, height: alto });
      await abrir(page);
      await expect(page.getByTestId('resumen-horario')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/horario-${ancho}${oscuro ? '-oscuro' : ''}.png`, fullPage: true });
    });
  }
});
