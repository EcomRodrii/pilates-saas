import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// /interno/verifactu → un estudio con facturas anteriores a VERI*FACTU.
//
// Criterio del fiscalista (30-sep-2026): no se remiten retroactivamente, la
// cadena continúa y no se borra nada. La barrera impide activar el estudio hasta
// registrar esa decisión con su criterio escrito. Aquí se prueba la pantalla:
// no deja decidir sin criterio, confirma antes de mandar, manda lo que debe, y
// un fallo del servidor no finge la decisión.
//
// ⚠️ CON CONTADOR (.claude/tentare-os.md): «no dijo decidido» también sería
// verdad con un botón que no manda nada. Lo que hace la base (solo añadir, solo
// antes de activar) se probó aparte contra un Postgres de verdad.
// ─────────────────────────────────────────────────────────────────────────────

const ESTUDIO = {
  studio_id: 'est-1', nif: '99999999R', nombre_fiscal: 'Estudio de Ejemplo', tipo_emisor: 'persona_fisica',
  numero_instalacion: 'est-1', estado: 'VERIFICADO', estado_motivo: null, activado_produccion_en: null,
  actualizado_en: '2026-09-30T10:00:00Z',
};

const SIN_DECIDIR = { ...ESTUDIO, facturas_anteriores_sin_decidir: 20, facturas_anteriores_no_remitidas: 0, decision_anteriores: null };
const DECIDIDO = {
  ...ESTUDIO, facturas_anteriores_sin_decidir: 0, facturas_anteriores_no_remitidas: 20,
  decision_anteriores: { creado_en: '2026-10-01T09:00:00Z', criterio: 'Fiscalista, criterio escrito del 30-09-2026', hasta_seq: 20 },
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, respuesta: 'ok' | 'error') {
  const acciones: Record<string, unknown>[] = [];
  // Playwright resuelve en orden INVERSO al de registro: la red de seguridad primero.
  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/api/interno/sesion**', r => json(r, {
    nombre: 'Fundador', cargo: 'Fundador y CEO', email: 'fundador@example.com', permisos: ['admin.full'],
  }));
  await page.route('**/api/interno/verifactu/declaracion', r => json(r, {
    titulo: 'DECLARACIÓN RESPONSABLE', version: '1.0.0', suscrita: null, apartados: [], falta: [],
  }));
  await page.route('**/api/interno/verifactu/estudios', r => {
    if (r.request().method() !== 'POST') return json(r, { estudios: [SIN_DECIDIR], representaciones: [] });
    acciones.push(r.request().postDataJSON() as Record<string, unknown>);
    return respuesta === 'ok'
      ? json(r, { estudios: [DECIDIDO], representaciones: [] })
      : json(r, { error: 'No se ha podido completar la acción.' }, 500);
  });
  await page.addInitScript(() => localStorage.setItem('sb-example-auth-token', JSON.stringify({
    access_token: 'e2e-fake-token', refresh_token: 'r', expires_at: 4102444800,
    expires_in: 999999999, token_type: 'bearer',
    user: {
      id: 'u-fundador', email: 'fundador@example.com', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    },
  })));
  await page.goto('/interno/verifactu');
  await expect(page.getByText('20 facturas emitidas antes de activar VERI*FACTU')).toBeVisible({ timeout: 40_000 });
  return acciones;
}

const noRemitir = (page: Page) => page.getByRole('button', { name: 'No remitirlas' });

test('sin criterio escrito no se decide, y mientras no se decide no se puede activar', async ({ page }) => {
  const acciones = await montar(page, 'ok');
  await expect(noRemitir(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Activar producción' })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(acciones).toHaveLength(0);
});

test('con criterio, confirma antes y manda la decisión; luego la muestra y ofrece activar', async ({ page }) => {
  const acciones = await montar(page, 'ok');
  await page.getByLabel('Criterio escrito en que se apoya (quién y cuándo)').fill('Fiscalista, criterio escrito del 30-09-2026');

  // Cancelar la confirmación no manda nada.
  page.once('dialog', d => void d.dismiss());
  await noRemitir(page).click();
  await page.waitForTimeout(300);
  expect(acciones).toHaveLength(0);

  page.once('dialog', d => {
    expect(d.message()).toContain('No se borran ni se tocan');
    void d.accept();
  });
  await noRemitir(page).click();
  await expect.poll(() => acciones.length, { timeout: 10_000 }).toBe(1);
  expect(acciones[0]).toMatchObject({
    accion: 'no_remitir_anteriores', studioId: 'est-1', criterio: 'Fiscalista, criterio escrito del 30-09-2026',
  });
  expect(String(acciones[0].motivo)).toContain('No se remiten retroactivamente');

  await expect(page.getByText(/20 facturas anteriores a VERI\*FACTU, fuera de la remisión desde el 01\/10\/2026/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activar producción' })).toBeVisible();
});

test('si el servidor no la registra, lo dice y sigue sin dejar activar', async ({ page }) => {
  const acciones = await montar(page, 'error');
  await page.getByLabel('Criterio escrito en que se apoya (quién y cuándo)').fill('Fiscalista, criterio escrito del 30-09-2026');
  page.once('dialog', d => void d.accept());
  await noRemitir(page).click();
  await expect.poll(() => acciones.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido completar la acción.' })).toBeVisible();
  await expect(page.getByText('20 facturas emitidas antes de activar VERI*FACTU')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activar producción' })).toHaveCount(0);
});
