import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tres señales que ya se estaban escribiendo y no las leía nadie.
//
//   · Los leads del formulario de migración de la landing, que ni siquiera se
//     guardaban: iban a un correo, y si `RESEND_API_KEY` no estaba puesta la
//     ruta devolvía `{ok:true}` y el lead desaparecía mientras la visitante
//     leía "Recibido, te escribimos en menos de 24h".
//   · `studios.como_nos_conocio`, que se rellena en el alta desde la migración
//     0123 y no salía en ninguna pantalla.
//   · `soporte_solicitudes`: 4 peticiones reales en producción, la más vieja de
//     abril, sin ninguna UI que las mostrase.
//
// La lógica está en `lib/interno/crecimiento.test.ts` (15 casos). Aquí se
// prueba lo que decide si la pantalla sirve: que lo primero que se ve es a
// quién escribir HOY, y que los números no se presentan como más sólidos de lo
// que son.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const HOY = Date.now();
const haceDias = (n: number) => new Date(HOY - n * 86_400_000).toISOString();
const dia = (n: number) => new Date(HOY - n * 86_400_000).toISOString().slice(0, 10);

const lead = (o: Record<string, unknown>) => ({
  nombre: null, estudio: null, telefono: null, ciudad: null, softwareActual: null,
  mensaje: null, origen: 'CONCIERGE', estado: 'NUEVO', motivoPerdida: null,
  proximoPaso: null, proximaFecha: null, studioId: null, notas: null,
  creadoEn: haceDias(0), actualizadoEn: haceDias(0), ...o,
});

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

async function mockPanel(page: Page, datos: Record<string, unknown>) {
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['admin.full'] }));
  await page.route('**/api/interno/crecimiento**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true, id: 'lead-x' });
    return json(route, { leads: [], estudios: [], peticiones: [], ...datos });
  });
}

test.describe('Crecimiento no deja que una señal se pierda ni infla las que hay', () => {
  test('lo primero es a quién escribir hoy, con el motivo', async ({ page }) => {
    await mockPanel(page, {
      leads: [
        lead({ id: 'l1', email: 'ana@ejemplo.com', nombre: 'Ana', creadoEn: haceDias(4), actualizadoEn: haceDias(4) }),
        lead({ id: 'l2', email: 'bea@ejemplo.com', nombre: 'Bea', estado: 'DEMO', proximaFecha: dia(3) }),
        lead({ id: 'l3', email: 'cris@ejemplo.com', nombre: 'Cris', estado: 'CLIENTE', creadoEn: haceDias(300), actualizadoEn: haceDias(300) }),
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const hoy = page.getByTestId('para-hoy');
    await expect(hoy).toBeVisible({ timeout: 30_000 });
    await expect(hoy).toContainText('2 lead(s) para hoy');
    await expect(hoy).toContainText('venció hace 3 día');
    await expect(hoy).toContainText('nadie le ha escrito');
    // Un cliente de hace 300 días no quema por viejo que sea.
    await expect(hoy).not.toContainText('Cris');
  });

  test('sin nada cerrado la conversión es «—», no 0 %', async ({ page }) => {
    // 0 % se lee como "no convertimos a nadie"; la verdad es "todavía no se sabe".
    await mockPanel(page, { leads: [lead({ id: 'l1', email: 'a@b.com', estado: 'DEMO' })] });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText('Conversión')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Todavía no se ha cerrado ninguno')).toBeVisible();
    await expect(page.getByText('0 %')).toHaveCount(0);
  });

  test('las peticiones se agrupan por lo que piden, no por quién lo pide', async ({ page }) => {
    await mockPanel(page, {
      peticiones: [
        { id: 'p1', tipo: 'MEJORA', mensaje: 'Quiero ClassPass', contacto: null, estudio: 'Boutique', creadoEn: haceDias(9) },
        { id: 'p2', tipo: 'MEJORA', mensaje: 'quiero classpass', contacto: null, estudio: 'Gràcia', creadoEn: haceDias(2) },
        { id: 'p3', tipo: 'MEJORA', mensaje: 'Quiero WhatsApp', contacto: null, estudio: 'Boutique', creadoEn: haceDias(1) },
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const bloque = page.getByTestId('peticiones');
    await expect(bloque).toBeVisible({ timeout: 30_000 });
    await expect(bloque).toContainText('2 estudios lo piden');
    await expect(bloque).toContainText('Boutique, Gràcia');
  });

  test('con 1 respuesta de 11, el «de dónde vienen» avisa de que es una anécdota', async ({ page }) => {
    // El caso real de producción: como_nos_conocio lo ha contestado 1 estudio.
    // Sin el aviso, "Instagram: 1" se lee como "el canal principal es Instagram".
    await mockPanel(page, {
      estudios: [
        { id: 's1', nombre: 'A', comoNosConocio: 'Instagram', creadoEn: haceDias(30) },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `s${i + 2}`, nombre: `E${i}`, comoNosConocio: null, creadoEn: haceDias(30),
        })),
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText(/Solo 1 de 11 estudios lo han contestado/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no es un reparto de canales, es una anécdota/)).toBeVisible();
  });

  test('marcar un lead como perdido exige decir por qué', async ({ page }) => {
    // Un embudo que dice cuántos se caen pero no por qué no cambia nada.
    await mockPanel(page, { leads: [lead({ id: 'l1', email: 'ana@ejemplo.com', nombre: 'Ana' })] });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await page.getByRole('button', { name: 'Ana' }).first().click({ timeout: 30_000 });
    const ficha = page.getByTestId('ficha-lead');
    await expect(ficha).toBeVisible();
    await expect(ficha.getByPlaceholder(/Por qué se ha perdido/)).toHaveCount(0);

    await ficha.getByLabel('Estado').selectOption('PERDIDO');
    await expect(ficha.getByPlaceholder(/Por qué se ha perdido/)).toBeVisible();
  });

  test('sin ningún lead se explica que los del formulario entran solos', async ({ page }) => {
    // Un vacío que no dice nada se lee como "esto está roto".
    await mockPanel(page, {});
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText(/Los del formulario de migración de la landing\s+entran aquí solos/))
      .toBeVisible({ timeout: 30_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El bug que motivó la migración 0136, con su propio guardia.
//
// La ruta pública del concierge hacía: `if (!apiKey) return {ok: true, skipped}`.
// Es decir, sin `RESEND_API_KEY` el lead desaparecía y la visitante leía
// "Recibido, te escribimos en menos de 24h". El único canal de entrada de leads
// del producto, mintiendo en silencio.
//
// En CI no hay ni Resend ni una Supabase de verdad, así que la ruta no puede
// capturar el lead por ningún lado — que es exactamente el escenario del bug.
// Lo que se fija aquí es que en ese caso DIGA que no lo ha recogido.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('El concierge de la landing no puede perder un lead en silencio', () => {
  test('si no lo guarda ni lo puede avisar, lo dice en vez de responder ok', async ({ request }) => {
    const res = await request.post('/api/public/migracion-concierge', {
      data: { email: 'propietaria@ejemplo.com', software: 'Momence' },
    });

    expect(res.ok(), 'un lead que no se ha recogido no puede responder 2xx').toBe(false);
    expect(res.status()).toBe(503);
    const cuerpo = await res.json();
    // Y con una salida para la persona, no un "error" a secas.
    expect(cuerpo.error).toContain('hola@tentare.app');
  });

  test('un email inválido se sigue rechazando antes de tocar nada', async ({ request }) => {
    const res = await request.post('/api/public/migracion-concierge', { data: { email: 'no-es-email' } });
    expect(res.status()).toBe(400);
  });
});
