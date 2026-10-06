import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La cola de moderación de Tentare (App Store 1.2). Lo que se prueba aquí es la
// pantalla: que enseña por qué le toca a Tentare, que decide de verdad (se
// cuenta la petición) y que, si el servidor dice que no, no finge que se hizo.
// Las reglas (quién, qué y cuándo) están en lib/moderacion/denuncias.test.ts y
// en la RPC `resolver_denuncia`.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';

const CONTRA_EL_ESTUDIO = {
  id: 'den-1', ambito: 'CHAT_ESTUDIO', motivo: 'DENUNCIA', creadaEn: '2026-10-05T08:00:00Z',
  detalle: 'Me escribe fuera de horario', contenido: 'Texto denunciado contra el estudio', contenidoRetirado: false,
  autor: 'El estudio', denunciante: 'Una alumna', estudio: { id: 'studio-e2e', nombre: 'Estudio de prueba' },
  porQue: 'CONTRA_EL_ESTUDIO', acciones: ['MANTENER', 'OCULTAR'],
};
const SIN_REVISAR = {
  id: 'den-2', ambito: 'CHAT_INSTRUCTORA', motivo: 'DENUNCIA', creadaEn: '2026-10-03T08:00:00Z',
  detalle: null, contenido: 'Mensaje de una instructora', contenidoRetirado: false,
  autor: 'Ana (equipo)', denunciante: 'Otra alumna', estudio: { id: 'studio-e2e-2', nombre: 'Otro estudio' },
  porQue: 'SIN_REVISAR_POR_EL_ESTUDIO', acciones: ['MANTENER', 'OCULTAR', 'CERRAR_CONVERSACION'],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

async function mockPanel(page: Page, opts: { decidir: number }) {
  let pendientes: unknown[] = [CONTRA_EL_ESTUDIO, SIN_REVISAR];
  const decisiones: unknown[] = [];
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['app.moderate'] }));
  await page.route('**/api/interno/denuncias**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, { denuncias: pendientes });
    decisiones.push({ url: req.url(), cuerpo: req.postDataJSON() });
    if (opts.decidir !== 200) return json(route, { error: 'Otra persona ya ha decidido sobre esta denuncia.' }, opts.decidir);
    pendientes = pendientes.filter(d => !req.url().endsWith(`/${(d as { id: string }).id}`));
    return json(route, { resultado: 'CONTENIDO_OCULTO' });
  });
  return decisiones;
}

test.describe('Denuncias de la app en /interno', () => {
  test('enseña por qué le toca a Tentare y retirar lo quita de la cola', async ({ page }) => {
    const decisiones = await mockPanel(page, { decidir: 200 });
    await seedSesion(page);
    await page.goto('/interno/denuncias');

    await expect(page.getByRole('heading', { name: 'Denuncias de la app' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Denuncias' })).toHaveCount(1);
    const filas = page.getByTestId('denuncia-interna');
    await expect(filas).toHaveCount(2);
    await expect(filas.first()).toContainText('Contra el estudio');
    await expect(filas.first()).toContainText('Texto denunciado contra el estudio');
    // Cerrar solo se ofrece donde el servidor lo dice (un chat con instructora).
    await expect(filas.first().getByRole('button', { name: 'Cerrar conversación' })).toHaveCount(0);
    await expect(filas.nth(1)).toContainText('El estudio no la revisó en 24 h');
    await expect(filas.nth(1).getByRole('button', { name: 'Cerrar conversación' })).toBeVisible();

    await filas.first().getByRole('button', { name: 'Retirar' }).click();
    await expect.poll(() => decisiones.length).toBeGreaterThan(0);
    expect(decisiones[0]).toMatchObject({ cuerpo: { accion: 'OCULTAR' } });
    expect((decisiones[0] as { url: string }).url).toMatch(/\/api\/interno\/denuncias\/den-1$/);
    // El estudio no viaja desde el navegador: lo saca el servidor de la denuncia.
    expect((decisiones[0] as { cuerpo: Record<string, unknown> }).cuerpo).not.toHaveProperty('studioId');
    await expect(page.getByRole('status')).toContainText('Retirado');
    await expect(filas).toHaveCount(1);
  });

  test('si el servidor dice que no, lo dice y no da nada por hecho', async ({ page }) => {
    const decisiones = await mockPanel(page, { decidir: 409 });
    await seedSesion(page);
    await page.goto('/interno/denuncias');

    const filas = page.getByTestId('denuncia-interna');
    await expect(filas).toHaveCount(2, { timeout: 30_000 });
    await filas.first().getByRole('button', { name: 'Mantener' }).click();
    await expect.poll(() => decisiones.length).toBeGreaterThan(0);
    await expect(page.getByRole('status')).toContainText('Otra persona ya ha decidido');
    await expect(page.getByRole('status')).not.toContainText('Mantenido');
  });

  test('sin el permiso de moderar la app, la sección no aparece', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/api/interno/sesion**', route =>
      json(route, { nombre: 'Meri', cargo: 'Cofundadora', email: 'meri@tentare.app', permisos: ['content.write'] }));
    await page.route('**/api/interno/ayuda-feedback**', route =>
      json(route, { resumen: { total: 0, pctMalo: 0, pctRegular: 0, pctBueno: 0 }, articulos: [] }));
    await seedSesion(page);
    await page.goto('/interno/ayuda');
    await expect(page.getByRole('link', { name: 'Ayuda' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Denuncias' })).toHaveCount(0);
  });
});
