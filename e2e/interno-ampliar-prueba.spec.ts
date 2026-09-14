import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// /interno → ficha de un estudio → «Añadir 7 días» de prueba gratuita.
//
// ⚠️ CON CONTADOR (ver .claude/tentare-os.md): que salga «Prueba ampliada» no
// prueba nada si no salió la petición, y abrir la confirmación no puede mandar
// nada todavía. Y la ficha es de cliente: sin recargarla tras la acción, seguiría
// diciendo «terminó» con la prueba ya ampliada — por eso se mira también el
// estado de arriba.
//
// Lo que la ruta hace de verdad contra PostgREST se prueba aparte, con el cliente
// real de supabase-js: lib/interno/ampliar-prueba.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
const enDias = (n: number) => new Date(Date.now() + n * DIA).toISOString();

type Prueba = { finaliza: string | null; estado: string | null; conSuscripcionStripe: boolean; esSede: boolean };

const ficha = (prueba: Prueba) => ({
  estudio: {
    id: 'est-1', slug: 'pilates-luz', nombre: 'Pilates Luz', plan: 'BASE',
    email: null, telefono: null, direccion: null, creadoEn: enDias(-8),
  },
  duena: null,
  pagos: { tieneClienteStripe: false, clienteStripeId: null, cobraConStripeConnect: false, facturaComoCadena: false },
  suspension: { suspendido: false, desde: null, motivo: null },
  uso: { socias: 0, clases: 0, reservas30d: 0, facturacionPropia30d: 0 },
  equipo: [],
  reviewBoost: { elegibleEn: null, mostradoEn: null, feedback: null, recompensaCanjeada: false },
  prueba,
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, inicial: Prueba) {
  let prueba = inicial;
  const acciones: string[] = [];

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/api/interno/sesion**', r => json(r, {
    nombre: 'Marco Roca', cargo: 'Fundador y CEO', email: 'marco@tentare.app', permisos: ['admin.full'],
  }));
  await page.route('**/api/interno/estudios/est-1', r => json(r, ficha(prueba)));
  await page.route('**/api/interno/estudios/est-1/acciones', r => {
    acciones.push(r.request().postData() ?? '');
    const hasta = enDias(7);
    prueba = { ...prueba, finaliza: hasta, estado: 'trialing' };
    return json(r, { ok: true, pruebaHasta: hasta });
  });
  await page.addInitScript(() => localStorage.setItem('sb-example-auth-token', JSON.stringify({
    access_token: 'e2e-fake-token', refresh_token: 'r', expires_at: 4102444800,
    expires_in: 999999999, token_type: 'bearer',
    user: {
      id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    },
  })));

  await page.goto('/interno/estudios/est-1');
  await expect(page.getByRole('heading', { name: 'Pilates Luz' })).toBeVisible({ timeout: 40_000 });
  return acciones;
}

const VENCIDA_AYER: Prueba = { finaliza: enDias(-1), estado: 'trial_expirado', conSuscripcionStripe: false, esSede: false };

test('una prueba que terminó ayer: confirmar «7 días más» la reabre, y la ficha lo refleja', async ({ page }) => {
  const acciones = await montar(page, VENCIDA_AYER);

  await expect(page.getByText(/^La prueba terminó el/)).toBeVisible();
  await page.getByRole('button', { name: 'Añadir 7 días…', exact: true }).click();

  // Abrir la confirmación dice hasta cuándo… y todavía no manda NADA.
  await expect(page.getByText(/^Quedará en prueba hasta el .+ sin cobrarle nada\.$/)).toBeVisible();
  expect(acciones).toHaveLength(0);

  await page.getByRole('button', { name: 'Confirmar 7 días más', exact: true }).click();

  await expect.poll(() => acciones.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(acciones).toHaveLength(1);
  expect(JSON.parse(acciones[0])).toEqual({ accion: 'ampliar-prueba' });
  await expect(page.getByText(/^Prueba ampliada hasta el .+ Ya puede volver a entrar\.$/)).toBeVisible();
  // La ficha se ha recargado: arriba ya no dice «terminó», y la confirmación se cerró.
  await expect(page.getByText(/^En prueba hasta el .+ quedan 7 días\.$/)).toBeVisible();
  await expect(page.getByText(/^La prueba terminó el/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar 7 días más', exact: true })).toHaveCount(0);
});

test('«Cancelar» en la confirmación no manda nada', async ({ page }) => {
  const acciones = await montar(page, VENCIDA_AYER);

  await page.getByRole('button', { name: 'Añadir 7 días…', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Añadir 7 días…', exact: true })).toBeVisible();
  expect(acciones).toHaveLength(0);
});

test('con suscripción de Stripe no se ofrece: dice por qué y no manda nada', async ({ page }) => {
  const acciones = await montar(page, { finaliza: enDias(-1), estado: 'active', conSuscripcionStripe: true, esSede: false });

  await expect(page.getByText('Tiene suscripción en Stripe: los días gratis se dan en Stripe.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Añadir .* días/ })).toHaveCount(0);
  expect(acciones).toHaveLength(0);
});
