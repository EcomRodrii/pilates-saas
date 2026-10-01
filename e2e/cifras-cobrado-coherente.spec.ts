import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// F0 · «Les chiffres ne sont pas corrects» (un estudio, 1-oct-2026).
//
// Medido en producción: en /cobros, «Lo que he cobrado» agrupaba lo cobrado por
// fecha de VENCIMIENTO y el KPI de encima por fecha de COBRO, así que la misma
// pantalla daba 424 € y 206 € para el mismo agosto. Además ninguna cifra
// restaba un reembolso parcial, y un recibo devuelto POR EL BANCO —deuda otra
// vez— no salía en lo que se debe.
//
// Este test siembra exactamente esos casos y exige que Inicio, el KPI de Cobros
// y el historial digan la MISMA cifra. La lógica vive en
// lib/billing/situacion-recibo.ts (con sus unitarios); esto comprueba que las
// pantallas la usan de verdad.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const masDias = (dia: string, n: number) => {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const HOY = hoyMadrid();
const base = { studio_id: 'studio-test', suscripcion_id: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null };

const RECIBOS = [
  // Renovación cobrada HOY con vencimiento dentro de 70 días (otro mes): cuenta
  // en el mes de cobro, no en el de vencimiento.
  { ...base, id: 'rec-renov', socio_id: 'soc-1', concepto: 'Renovación Bono 10', importe: 100, estado: 'COBRADO', fecha_vencimiento: masDias(HOY, 70), fecha_cobro: HOY, importe_devuelto: 0, metodo_cobro: 'TARJETA' },
  // Cobrado hoy con 20 € reembolsados: cuentan 40.
  { ...base, id: 'rec-parcial', socio_id: 'soc-3', concepto: 'Mensual', importe: 60, estado: 'COBRADO', fecha_vencimiento: HOY, fecha_cobro: HOY, importe_devuelto: 20, metodo_cobro: 'TARJETA' },
  // Devuelto por el banco: deuda, no ingreso.
  { ...base, id: 'rec-banco', socio_id: 'soc-2', concepto: 'Mensual — adeudo', importe: 30, estado: 'DEVUELTO', fecha_vencimiento: masDias(HOY, -5), fecha_cobro: null, fecha_devolucion: masDias(HOY, -3), importe_devuelto: 0 },
  // Enviado al banco y sin confirmar: ni ingreso ni deuda todavía.
  { ...base, id: 'rec-en-curso', socio_id: 'soc-4', concepto: 'Mensual — remesa', importe: 50, estado: 'EN_CURSO', fecha_vencimiento: HOY, fecha_cobro: null, importe_devuelto: 0 },
  // Reembolsado entero: nada.
  { ...base, id: 'rec-reemb', socio_id: 'soc-1', concepto: 'Clase suelta', importe: 15, estado: 'DEVUELTO', fecha_vencimiento: HOY, fecha_cobro: HOY, fecha_devolucion: HOY, importe_devuelto: 15 },
];

async function sembrar(page: Page) {
  await montar(page);
  // Después de montar(): Playwright da prioridad a la ruta registrada la última.
  await page.route('**/rest/v1/recibos**', (r: Route) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECIBOS) }));
}

const tarjeta = (page: Page, titulo: string) => page.locator('div.bg-card').filter({ hasText: titulo }).last();

test('Cobros: lo cobrado es neto, va en su mes de cobro y cuadra con el historial', async ({ page }) => {
  await sembrar(page);
  await ir(page, 'cobros');

  // 100 + (60 − 20) = 140. Ni lo reembolsado, ni lo del banco, ni lo en curso.
  await expect(tarjeta(page, 'Cobrado este mes')).toContainText('140,00 €', { timeout: 30_000 });

  // Lo que se debe: solo el devuelto por el banco. Lo enviado al banco, aparte.
  const pendiente = tarjeta(page, 'Pendiente cobro');
  await expect(pendiente).toContainText('30,00 €');
  await expect(pendiente).toContainText('50,00 €');
  await expect(pendiente).toContainText('enviados al banco');

  // El devuelto por el banco sale en «Todo lo que me deben»; el reembolsado no.
  await expect(page.locator('[data-recibo="rec-banco"]').first()).toBeVisible();
  await expect(page.locator('[data-recibo="rec-reemb"]')).toHaveCount(0);

  // El historial dice lo mismo que el KPI, y la renovación está en ESTE mes.
  await ir(page, 'cobros?tab=cobrado');
  await expect(page.getByText('140,00 € cobrado', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Renovación Bono 10').first()).toBeVisible();
  // Agrupando por vencimiento salían dos meses: «40,00 € cobrado» en este y
  // «100,00 € cobrado» en el del vencimiento de la renovación.
  await expect(page.getByText('100,00 € cobrado', { exact: true })).toHaveCount(0);
  await expect(page.getByText('40,00 € cobrado', { exact: true })).toHaveCount(0);
});

test('Inicio dice la misma cifra que Cobros', async ({ page }) => {
  await sembrar(page);
  await ir(page, 'dashboard');
  const tarjetaIngresos = page.locator('div').filter({ has: page.getByText('Ingresos cobrados este mes', { exact: true }) }).last();
  await expect(tarjetaIngresos).toContainText('140 €', { timeout: 30_000 });
});
