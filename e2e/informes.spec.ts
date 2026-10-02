import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Informes, rediseño del 2-oct-2026.
//
// Lo que no puede volver a pasar: que «Cobrado» de Informes y «Cobrado en
// <mes>» de Cobros digan dos cifras distintas del mismo dinero. Antes Informes
// las pedía a una RPC con su propio rango y Cobros las sumaba en el navegador;
// ahora es la misma función sobre los mismos recibos, y esto lo comprueba con
// los MISMOS mocks en las dos pantallas.
//
// Y el camino de fallo de «Descargar» con su contador de peticiones: un test que
// dice «no bajó fichero» sin comprobar que se pidió algo pasa también cuando el
// botón no hace nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
/** 'YYYY-MM' de hace `n` meses. */
const mes = (n: number) => {
  const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - n, 1));
  return d.toISOString().slice(0, 7);
};

const recibo = (id: string, fecha: string, importe: number, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: null, concepto: 'Cobro', importe, estado: 'COBRADO',
  fecha_vencimiento: fecha, fecha_cobro: fecha, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'EFECTIVO',
  importe_devuelto: 0, ...extra,
});

// Este mes: una cuota el día 1 (siempre es pasado o hoy). El mes pasado, cerrado:
// bono 130 + clase suelta 15 + ticket de caja 25 + sesión privada 40 con 10
// devueltos = 200. El de antes: 100.
const RECIBOS = [
  recibo('rec-cuota-0', `${mes(0)}-01`, 50, { socio_id: 'soc-2', suscripcion_id: 'sus-2' }),
  recibo('rec-bono-1', `${mes(1)}-10`, 130, { suscripcion_id: 'sus-1' }),
  recibo('rec-suelta-res-1', `${mes(1)}-20`, 15, { socio_id: 'soc-3' }),
  recibo('rec-pos-v1', `${mes(1)}-03`, 25, { socio_id: null }),
  recibo('rec-cita-c1', `${mes(1)}-12`, 40, { importe_devuelto: 10 }),
  recibo('rec-cuota-2', `${mes(2)}-05`, 100, { socio_id: 'soc-2', suscripcion_id: 'sus-2' }),
  // No cuentan: pendiente y devuelto por el banco.
  recibo('rec-pendiente', `${mes(0)}-01`, 89, { estado: 'PENDIENTE', fecha_cobro: null }),
  recibo('rec-banco', `${mes(1)}-15`, 89, { estado: 'DEVUELTO' }),
];

const euros = (n: number) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
const sumaEntre = (desde: string, hasta: string) => RECIBOS
  .filter(r => r.estado === 'COBRADO' && r.fecha_cobro && r.fecha_cobro >= desde && r.fecha_cobro <= hasta)
  .reduce((t, r) => t + r.importe - r.importe_devuelto, 0);

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
const esExport = (url: string) => decodeURIComponent(url).includes('socios(nombre');

async function montarInformes(page: Page) {
  await montar(page);
  // ⚠️ Después de `montar()`: Playwright prioriza la ruta registrada más tarde.
  await page.route('**/rest/v1/recibos**', r => json(r, RECIBOS));
}

const cobradoInformes = (page: Page) => page.getByTestId('informe-cobrado').locator('[data-valor]');

test('el «Cobrado» de Informes es el «Cobrado en <mes>» de Cobros, con los mismos datos', async ({ page }) => {
  await montarInformes(page);
  await ir(page, 'cobros');
  const linea = page.getByTestId('linea-resumen-cobros');
  await expect(linea).toContainText(`Cobrado en`, { timeout: 30_000 });
  const textoCobros = await linea.innerText();
  const enCobros = textoCobros.match(/Cobrado en \S+\s+([\d.,]+ €)/)?.[1];
  expect(enCobros, `no se encontró la cifra en «${textoCobros}»`).toBeTruthy();

  await ir(page, 'informes');
  await expect(cobradoInformes(page)).toHaveText(enCobros!, { timeout: 30_000 });
  expect(enCobros).toBe(euros(sumaEntre(`${mes(0)}-01`, hoy)));
});

test('con la flecha, el mes pasado cerrado frente al de antes entero, y por qué entró', async ({ page }) => {
  await montarInformes(page);
  await ir(page, 'informes');
  await expect(cobradoInformes(page)).toHaveText(euros(50), { timeout: 30_000 });

  await page.getByRole('button', { name: 'Periodo anterior' }).click();
  await expect(cobradoInformes(page)).toHaveText(euros(200));
  const titular = page.getByTestId('informe-cobrado');
  await expect(titular).toContainText(`+${euros(100)}`);
  await expect(titular).toContainText(`(${euros(100)})`);

  const motivos = page.getByTestId('informe-motivos');
  for (const [motivo, n] of [['Bonos', 130], ['Clases sueltas', 15], ['Caja (TPV)', 25], ['Sesiones privadas', 30], ['Cuotas', 0]] as const) {
    await expect(motivos.locator('div').filter({ hasText: motivo }).first()).toContainText(euros(n));
  }
  // Pagaron dos clientas, 175 € entre las dos (la caja sin clienta no cuenta): 87,50 €.
  const medio = page.getByTestId('informe-ingreso-medio');
  await expect(medio).toContainText(euros(87.5));
  await expect(medio).toContainText(`2 clientas pagaron ${euros(175)}`);
  await expect(medio).toContainText(/no cuenta las ventas de caja sin clienta/);

  // Y no se puede ir al futuro: desde el mes en curso, la flecha de la derecha está apagada.
  await page.getByRole('button', { name: 'Periodo siguiente' }).click();
  await expect(page.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
});

test('trimestre natural y año, hasta hoy', async ({ page }) => {
  await montarInformes(page);
  await ir(page, 'informes');
  await expect(cobradoInformes(page)).toHaveText(euros(50), { timeout: 30_000 });

  const m = Number(hoy.slice(5, 7));
  const inicioTrimestre = `${hoy.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  await page.getByRole('button', { name: 'Trimestre', exact: true }).click();
  await expect(page.getByTestId('informe-periodo')).toContainText('trimestre');
  await expect(cobradoInformes(page)).toHaveText(euros(sumaEntre(inicioTrimestre, hoy)));
  await expect(page.getByTestId('informe-cobrado')).toContainText('frente al trimestre anterior');

  await page.getByRole('button', { name: 'Año', exact: true }).click();
  await expect(page.getByTestId('informe-periodo')).toHaveText(hoy.slice(0, 4));
  await expect(cobradoInformes(page)).toHaveText(euros(sumaEntre(`${hoy.slice(0, 4)}-01-01`, hoy)));
});

test('si la descarga falla, no baja ningún fichero y se dice', async ({ page }) => {
  await montarInformes(page);
  let intentos = 0;
  await page.route('**/rest/v1/recibos**', (r) => {
    if (!esExport(r.request().url())) return r.fallback();
    intentos++;
    return json(r, { message: 'boom' }, 500);
  });
  let descargas = 0;
  page.on('download', () => { descargas++; });

  await ir(page, 'informes');
  await expect(cobradoInformes(page)).toHaveText(euros(50), { timeout: 30_000 });
  await page.getByRole('button', { name: 'Descargar' }).click();
  await page.getByRole('menuitem', { name: /Lo cobrado/ }).click();

  await expect(page.getByText('No se ha podido preparar el fichero')).toBeVisible({ timeout: 15_000 });
  expect(intentos).toBeGreaterThan(0);
  expect(descargas).toBe(0);
});

test('en el móvil no se ofrece la semana', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await montarInformes(page);
  await ir(page, 'informes');
  await expect(cobradoInformes(page)).toHaveText(euros(50), { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Semana', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Mes', exact: true })).toBeVisible();
  // Nada se sale del ancho de la pantalla.
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(375);
});
