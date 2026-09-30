import { test, expect, type Page, type Route } from '@playwright/test';

// /interno/estudios: los clientes de pago, arriba y con su salud; la ficha de
// uno de ellos, con el mismo bloque. Nace de «un estudio ha pagado y no sé cuál
// es, qué hace ni en qué está bloqueado» (30-sep).

const DIA = 86_400_000;
const hace = (n: number) => new Date(Date.now() - n * DIA).toISOString();

const salud = (nivel: 'bien' | 'atencion' | 'riesgo', avisos: string[], senales: Record<string, unknown>, diasSinEntrar: number | null) => ({
  nivel, avisos, diasSinEntrar, sentryUrl: 'https://org.sentry.io/issues/?query=studio_id%3Aest-pago',
  senales: { estadoSuscripcion: 'active', ultimoAccesoDuena: hace(diasSinEntrar ?? 0), reservas7d: 40, clasesProximas7d: 12, cobrosFallidos30d: 0, ...senales },
});

const fila = (o: Record<string, unknown>) => ({
  email: null, telefono: null, creadoEn: hace(7), tieneClienteStripe: true, socias: 24, clases: 348, equipo: 3,
  ultimaClase: null, vacio: false, dePago: false, estadoSuscripcion: null, salud: null, plan: 'BASE', ...o,
});

const ESTUDIOS = [
  fila({ id: 'est-prueba', slug: 'en-prueba', nombre: 'Estudio en prueba', estadoSuscripcion: 'trialing' }),
  fila({ id: 'est-bien', slug: 'va-bien', nombre: 'Va Bien Pilates', dePago: true, estadoSuscripcion: 'active', salud: salud('bien', [], {}, 1) }),
  fila({
    id: 'est-pago', slug: 'luna', nombre: 'Estudio Luna', dePago: true, estadoSuscripcion: 'active',
    salud: salud('atencion', ['Ninguna reserva en los últimos 7 días', '1 cobro fallido a sus alumnas (30 días)'], { reservas7d: 0, cobrosFallidos30d: 1 }, 2),
  }),
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/api/interno/sesion**', r => json(r, {
    nombre: 'Equipo', cargo: 'Fundador', email: 'equipo@example.com', permisos: ['admin.full'],
  }));
  await page.route(u => u.pathname === '/api/interno/estudios', r => json(r, { estudios: ESTUDIOS }));
  await page.route('**/api/interno/estudios/est-pago', r => json(r, {
    estudio: { id: 'est-pago', slug: 'luna', nombre: 'Estudio Luna', plan: 'BASE', email: null, telefono: null, direccion: null, creadoEn: hace(7) },
    duena: { email: null, ultimoAcceso: hace(2), alta: hace(7) },
    pagos: { tieneClienteStripe: true, clienteStripeId: 'cus_x', cobraConStripeConnect: true, facturaComoCadena: false },
    suspension: { suspendido: false, desde: null, motivo: null },
    uso: { socias: 24, clases: 348, reservas30d: 334, facturacionPropia30d: 566 },
    equipo: [],
    reviewBoost: { elegibleEn: null, mostradoEn: null, feedback: null, recompensaCanjeada: false },
    prueba: { finaliza: null, estado: 'active', conSuscripcionStripe: true, esSede: false },
    salud: ESTUDIOS[2].salud,
  }));
  await page.addInitScript(() => localStorage.setItem('sb-example-auth-token', JSON.stringify({
    access_token: 'e2e-fake-token', refresh_token: 'r', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: 'u-equipo', email: 'equipo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  })));
}

test.describe.configure({ timeout: 120_000 });

test('los clientes de pago salen arriba, los que peor van primero, con lo que hay que mirar', async ({ page }) => {
  await montar(page);
  await page.goto('/interno/estudios');
  const pago = page.getByTestId('clientes-de-pago');
  await expect(pago.getByRole('heading', { name: 'Clientes de pago (2)' })).toBeVisible({ timeout: 40_000 });

  const tarjetas = pago.locator('article');
  await expect(tarjetas).toHaveCount(2);
  // «Atención» antes que «Bien».
  await expect(tarjetas.first()).toContainText('Estudio Luna');
  await expect(tarjetas.first()).toContainText('Atención');
  await expect(tarjetas.first()).toContainText('1 cobro fallido a sus alumnas (30 días)');
  await expect(tarjetas.first().getByRole('link', { name: /Sus errores en Sentry/ })).toHaveAttribute('href', /studio_id%3Aest-pago/);
  await expect(tarjetas.last()).toContainText('Bien');

  // El que está en prueba local NO es de pago: va a la lista de siempre.
  await expect(pago).not.toContainText('Estudio en prueba');
  await expect(page.getByText('Estudio en prueba')).toBeVisible();
});

test('su ficha dice cómo está y qué estado tiene su suscripción', async ({ page }) => {
  await montar(page);
  await page.goto('/interno/estudios/est-pago');
  const bloque = page.getByTestId('salud-estudio');
  await expect(bloque).toBeVisible({ timeout: 40_000 });
  await expect(bloque).toContainText('Atención');
  await expect(bloque).toContainText('Ninguna reserva en los últimos 7 días');
  await expect(page.getByText('Suscripción a Tentare')).toBeVisible();
  await expect(page.getByText('Pagando', { exact: true })).toBeVisible();
});
