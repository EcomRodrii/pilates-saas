import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-20. "La suscripción no dice ni el precio ni cuándo me cobráis. Solo 'Plan
// actual: Cadena'. Es mi factura mensual. Quiero ver 149 €, la fecha y la
// tarjeta."
//
// Los dos primeros datos ya los teníamos y no se enseñaban: el precio está en el
// catálogo de planes y la fecha la lee /api/billing/status de la base de datos
// (`current_period_end`), que solo se exponía durante la prueba gratuita. La
// tarjeta vive en Stripe, así que a eso se llega por el portal — y ahora el
// botón dice que es ahí donde está.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarSuscripcion(page: Page, estado: Record<string, unknown>) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/status**', route => json(route, estado));
  await page.route('**/rest/v1/**', route => json(route, []));

  await page.goto('/suscripcion');
}

test.describe('Pantalla de suscripción', () => {
  test('con plan activo dice cuánto y cuándo', async ({ page }) => {
    await montarSuscripcion(page, {
      plan: 'CADENA',
      subscriptionStatus: 'active',
      activo: true,
      configurado: true,
      esPropietaria: true,
      bloqueado: false,
      enPrueba: false,
      pruebaTermina: null,
      periodoTermina: '2026-08-15T10:00:00+00:00',
    });

    await expect(page.getByText('Plan actual')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cadena', { exact: true })).toBeVisible();

    // El importe que ella pedía ver.
    await expect(page.getByText(/149€/)).toBeVisible();
    await expect(page.getByText(/al mes, IVA incluido/)).toBeVisible();

    // Y la fecha del cargo, en cristiano.
    await expect(page.getByText(/Próximo cobro el/)).toBeVisible();
    await expect(page.getByText(/15 de agosto de 2026/)).toBeVisible();

    // La tarjeta está en Stripe: el botón dice a dónde lleva. El rótulo cambió
    // al rediseñar la pantalla (apertura al público) y ahora nombra las tres
    // cosas que hay detrás; la promesa de P2-20 —que se vea dónde está la
    // tarjeta— se mantiene.
    await expect(page.getByRole('button', { name: 'Facturas, tarjeta y cambio de plan' })).toBeVisible();
  });

  // Prueba de STRIPE (con tarjeta), no la local de 7 días: son las
  // suscripciones anteriores a que la prueba dejara de vivir en Stripe. Ya no
  // se crean nuevas, pero las que hay siguen vivas.
  test('durante la prueba, la fecha se anuncia como PRIMER cobro', async ({ page }) => {
    await montarSuscripcion(page, {
      plan: 'ESTUDIO',
      subscriptionStatus: 'trialing',
      activo: true,
      configurado: true,
      esPropietaria: true,
      bloqueado: false,
      enPrueba: true,
      pruebaTermina: '2026-08-15T10:00:00+00:00',
      periodoTermina: '2026-08-15T10:00:00+00:00',
    });

    await expect(page.getByText('Plan actual')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/59€/)).toBeVisible();
    // Cobrar y "primer cobro" no son lo mismo: durante la prueba aún no se ha pagado.
    await expect(page.getByText(/Primer cobro el/)).toBeVisible();
    await expect(page.getByText(/Próximo cobro el/)).toHaveCount(0);
  });

  test('sin fecha del proveedor no se inventa ninguna', async ({ page }) => {
    await montarSuscripcion(page, {
      plan: 'BASE',
      subscriptionStatus: 'active',
      activo: true,
      configurado: true,
      esPropietaria: true,
      bloqueado: false,
      enPrueba: false,
      pruebaTermina: null,
      periodoTermina: null,
    });

    await expect(page.getByText('Plan actual')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/29€/)).toBeVisible();
    // Mejor no decir nada que decir una fecha que no sabemos.
    await expect(page.getByText(/cobro el/)).toHaveCount(0);
  });
});
