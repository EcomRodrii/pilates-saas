import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría de arquitectura (22-sep-2026): la recomendación que gana el
// Veredicto del Día (`/api/decisiones` la trae en `pendientes` sin excluirla)
// también podía aparecer como tarjeta normal en Prioridades — la misma
// situación, dos veces, en la pantalla que promete "un solo mensaje".
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const TITULO = 'Ana lleva 30 días sin reservar';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function recomendacion(id: string) {
  return {
    id, especialista: 'RETENCION', tipo: 'CLIENTA_EN_RIESGO', titulo: TITULO,
    motivo: 'No reserva desde hace 30 días.', datosUsados: {}, riesgo: 'PERDIDA' as const,
    impacto: { valor: 45, unidad: 'EUR_MES', formula: '' }, score: 80, prioridad: 'ALTA' as const,
    confianza: { nivel: 'ALTA' as const, evidencia: [], autonomiaMaxima: 0 },
    nivelAutonomia: 0, accion: { tipo: 'CONTACTO_MANUAL' }, socioId: null,
    tiempoEstimadoMin: 5, estado: 'PENDIENTE', expiraEn: '2026-12-31T00:00:00Z',
    creadoEn: '2026-09-22T06:00:00Z',
  };
}

async function montarCentro(page: Page) {
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

  const ganadora = recomendacion('rec-duplicada');
  await page.route('**/api/decisiones**', route => json(route, {
    resumen: {
      saludo: 'Buenos días', mientrasDormias: [], nDecisiones: 1,
      tiempoEstimadoMin: 5, impactoTotal: null, generadoEn: '2026-09-22T06:30:00+00:00',
    },
    veredicto: {
      tipo: 'MENSAJE', recomendacion: ganadora, fraseConfianza: null, semanaTranquila: false, porApertura: false,
    },
    seguimiento: [],
    // La misma recomendación del veredicto, SIN excluir — así la devuelve hoy
    // `dbListPendientes` en `app/api/decisiones/route.ts`.
    prioridades: [ganadora],
    masSituaciones: [],
    porEspecialista: [{ especialista: 'RETENCION', pendientes: 1, impactoTotal: null, estado: 'ATENCION' }],
    actividad: [],
    nAutonomasHoy: 0,
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/centro-de-control');
}

test('la recomendación del Veredicto del Día no se repite como tarjeta en Prioridades', async ({ page }) => {
  await montarCentro(page);

  // El titular del hero (fuera del desplegable) ya la muestra.
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Ver todo el detalle' }).click();

  // Y no debe volver a aparecer como tarjeta normal en Prioridades: solo la
  // aparición del hero (heading), ninguna más.
  await expect(page.getByText(TITULO)).toHaveCount(1);
});
