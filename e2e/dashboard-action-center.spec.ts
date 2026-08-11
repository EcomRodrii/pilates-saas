import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Brain · Fase 5 — el Action Center.
//
// El problema no era de inteligencia, era de sitio: todo el Decision OS vivía
// en /centro-de-control y /dashboard —la pantalla que se abre al entrar— no lo
// mencionaba en ningún lado. Dos "inicios" compitiendo, y ganaba el que no
// sabe nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function rec(p: Record<string, unknown>) {
  return {
    id: 'r-1', especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA',
    titulo: 'Algo pasa', motivo: '...', datosUsados: {},
    riesgo: 'PERDIDA', impacto: null,
    confianza: { nivel: 'ALTA', evidencia: [], autonomiaMaxima: 2 },
    score: 50, prioridad: 'ALTA', nivelAutonomia: 2,
    accion: { tipo: 'CONTACTO_MANUAL' }, socioId: null,
    tiempoEstimadoMin: 2, estado: 'PENDIENTE',
    expiraEn: '2099-01-01T00:00:00Z', creadoEn: '2026-08-11T06:30:00Z',
    ...p,
  };
}

async function montarDashboard(page: Page, opts: {
  prioridades?: unknown[];
  /** Rol del que abre el panel. La propietaria es dueña del estudio. */
  rol?: 'PROPIETARIO' | 'RECEPCION';
  /** /api/decisiones devuelve `{}` en vez de la forma esperada. */
  decisionesRotas?: boolean;
} = {}) {
  const { prioridades = [], rol = 'PROPIETARIO', decisionesRotas = false } = opts;

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
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/decisiones**', route => decisionesRotas ? json(route, {}) : json(route, {
    resumen: null,
    veredicto: { tipo: 'SIN_ANALIZAR', recomendacion: null, fraseConfianza: null, semanaTranquila: false },
    seguimiento: [], prioridades, masSituaciones: [], porEspecialista: [], actividad: [],
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // Con rol RECEPCION la dueña del estudio es OTRA persona: es lo que hace que
  // `useRol` no devuelva PROPIETARIO.
  await page.route('**/rest/v1/studios**', route =>
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: rol === 'PROPIETARIO' ? AUTH_UID : 'auth-otra-persona',
    }));
  await page.route('**/rest/v1/instructores**', route =>
    json(route, rol === 'PROPIETARIO' ? [] : [
      { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', auth_user_id: AUTH_UID },
    ]));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
}

function assertSinErrores(errores: string[]) {
  expect(errores, `errores de JS en la página: ${errores.join(' | ')}`).toEqual([]);
}

test.describe('El dashboard trae lo que necesita atención, sin ir a buscarlo', () => {
  test('con cosas pendientes, la propietaria las ve arriba y con su importe', async ({ page }) => {
    await montarDashboard(page, {
      prioridades: [
        rec({ id: 'r-1', titulo: 'Laura lleva 21 días sin venir', impacto: { valor: 89, unidad: 'EUR_MES', formula: 'cuota' } }),
        rec({ id: 'r-2', titulo: '4 pagos fallidos', accion: { tipo: 'COBRAR_RECIBOS' }, impacto: { valor: 236, unidad: 'EUR', formula: 'recibos' } }),
        rec({ id: 'r-3', titulo: 'Hay 8 plazas que llenar', riesgo: 'OPORTUNIDAD', accion: { tipo: 'MARCAR_GESTIONADO' }, impacto: { valor: 340, unidad: 'EUR', formula: 'plazas' } }),
      ],
    });

    await expect(page.getByText('2 cosas necesitan tu atención')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Laura lleva 21 días sin venir')).toBeVisible();
    // Las dos unidades por separado: 89 €/mes y 236 € no se suman en una cifra.
    await expect(page.getByText('89 €/mes y 236 € en juego')).toBeVisible();
    await expect(page.getByText('Una oportunidad')).toBeVisible();
    await expect(page.getByText('+340 €')).toBeVisible();
  });

  test('dice cuántas resuelve Tentare sola — lo que nivelAutonomia sabía y nadie enseñaba', async ({ page }) => {
    await montarDashboard(page, {
      prioridades: [
        rec({ id: 'r-1', titulo: 'Manda el email', accion: { tipo: 'ENVIAR_EMAIL' } }),
        rec({ id: 'r-2', titulo: 'Cambia el horario', accion: { tipo: 'MARCAR_GESTIONADO' } }),
      ],
    });
    await expect(page.getByText('Una la hago yo con un toque')).toBeVisible({ timeout: 30_000 });
  });

  test('sin nada pendiente no ocupa ni un píxel (nada de "todo en orden" cada mañana)', async ({ page }) => {
    await montarDashboard(page, { prioridades: [] });
    // El dashboard carga...
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    // ...y del Action Center no hay ni rastro.
    await expect(page.getByText(/necesitan tu atención|necesita tu atención/)).toHaveCount(0);
    await expect(page.getByText('Ver y decidir')).toHaveCount(0);
  });

  // Regresión: la primera versión hacía `[...data.prioridades]` a secas y
  // reventaba la pantalla ENTERA del negocio con un `{}` por respuesta. Es el
  // caso que da un plan sin el módulo, un cuerpo de error con 200 o un
  // despliegue a medias — y aquí no rompe solo su tarjeta, rompe el dashboard.
  test('una respuesta inesperada de /api/decisiones no tumba el dashboard', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', e => errores.push(e.message));
    // Todo el resto del panel monta normal; SOLO /api/decisiones devuelve un
    // cuerpo que no es el esperado. Es lo que da un plan sin el módulo, un
    // error servido con 200 o un despliegue a medias.
    await montarDashboard(page, { decisionesRotas: true });

    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    assertSinErrores(errores);
  });

  test('recepción no lo ve: /centro-de-control es solo de la propietaria', async ({ page }) => {
    await montarDashboard(page, {
      rol: 'RECEPCION',
      prioridades: [rec({ id: 'r-1', titulo: 'Laura lleva 21 días sin venir' })],
    });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    // Un enlace a una pantalla que su guardia de ruta le vacía no es un enlace.
    await expect(page.getByText('Ver y decidir')).toHaveCount(0);
  });
});
