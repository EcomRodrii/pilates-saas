import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración → Plan en el marco a sangre (components/billing/plan-shell.tsx):
// «Información del plan» y «Seleccionar plan». Lo que importa: que elegir un plan
// NO cobre, que haga falta confirmar, y que un pago que falla se diga. Con
// PLAN_CAPTURAS=<carpeta> guarda las dos pantallas.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 240_000 });

const GRATIS = { fase: 'DENTRO', uso: { alumnasActivas: 60, reservas30Dias: 112 }, motivos: [], diasRestantes: null, cierraEl: null, limites: { reservasMes: 150 }, margenDias: 30 };
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function preparar(page: Page, estado: Record<string, unknown>) {
  const pagos: string[] = [];
  await montar(page);
  // Después de `montar`: gana a su comodín.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill(json({ panelNuevo: true, shellNuevo: true })));
  await page.route('**/api/billing/status**', (r) => r.fulfill(json({
    activo: true, configurado: true, esPropietaria: true, bloqueado: false, enPrueba: false, pruebaTermina: null,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null }, ...estado,
  })));
  await page.route('**/api/billing/checkout**', (r) => { pagos.push(r.request().postData() ?? ''); return r.fulfill(json({ error: 'sin Stripe en el e2e' }, 500)); });
  await ir(page, 'configuracion?tab=plan');
  return pagos;
}

const foto = async (page: Page, nombre: string) => {
  const carpeta = process.env.PLAN_CAPTURAS;
  if (carpeta) await page.screenshot({ path: `${carpeta}/${nombre}.png`, fullPage: true });
};

test('gratis: se ve el plan y lo usado; elegir otro no cobra hasta confirmar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const pagos = await preparar(page, { plan: 'BASE', subscriptionStatus: 'gratis', periodoTermina: null, gratis: GRATIS });

  const plan = page.getByRole('region', { name: 'Tu plan' });
  await expect(plan.getByRole('heading', { name: 'Información del plan' })).toBeVisible({ timeout: 90_000 });
  await expect(plan).toContainText('Tú eres la prioridad');
  await expect(plan).toContainText('con IA van aparte');
  await expect(page.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuenow', '112');
  await foto(page, 'plan-gratis');

  await plan.getByRole('button', { name: 'Elegir plan' }).click();
  await expect(page.getByRole('heading', { name: 'Planes desde 29 €' })).toBeVisible();
  const tarjetas = page.getByRole('radiogroup', { name: 'Plan' });
  await expect(tarjetas.getByRole('region', { name: 'Founding Studio' })).toContainText('Sustituciones automáticas: +12 €/mes');
  await foto(page, 'plan-elegir');

  await tarjetas.getByRole('radio', { name: 'Elegir Estudio' }).click();
  await expect(page.getByRole('button', { name: /^Continuar con Estudio · 79 €\/mes$/ })).toBeVisible();
  expect(pagos, 'elegir una tarjeta no puede pedir el pago').toHaveLength(0);

  await page.getByRole('button', { name: /^Continuar con Estudio/ }).click();
  await expect.poll(() => pagos.length, { message: 'confirmar no llegó a pedir el pago' }).toBe(1);
  expect(pagos[0]).toContain('ESTUDIO');
  await expect(page.getByRole('alert').filter({ hasText: 'sin Stripe en el e2e' })).toBeVisible();

  await page.getByRole('button', { name: 'Volver a Plan' }).click();
  await expect(plan).toBeVisible();
});

test('ya paga: plan, importe, próximo cobro y la puerta a Stripe', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await preparar(page, {
    plan: 'ESTUDIO', subscriptionStatus: 'active', periodoTermina: '2026-12-15T10:00:00Z', gratis: null,
    trial: { fase: 'SUSCRITO', diasRestantes: 0, finaliza: null },
  });
  const plan = page.getByRole('region', { name: 'Tu plan' });
  await expect(plan).toContainText('Estudio', { timeout: 90_000 });
  await expect(plan).toContainText('79€ · al mes, IVA incluido · sin permanencia');
  await expect(plan).toContainText('15 de diciembre de 2026');
  await expect(plan.getByRole('button', { name: 'Facturas, tarjeta y cambio de plan' })).toBeVisible();
  await foto(page, 'plan-paga');
});
