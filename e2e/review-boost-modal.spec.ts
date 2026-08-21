import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Review Boost — prueba real del flujo completo en navegador: el modal
// aparece cuando el estudio está marcado elegible, 4-5★ enseña la recompensa
// y la invitación a Capterra/GetApp (sin condicionarla), 1-3★ va a feedback
// interno sin recompensa ni plataformas, y una vez respondido no vuelve a
// aparecer al recargar.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarDashboard(page: Page, opts: {
  elegible?: boolean;
  mostrado?: boolean;
  feedbackPost?: { status: number; body: unknown };
} = {}) {
  const { elegible = true, mostrado = false, feedbackPost = { status: 200, body: { estado: 'positivo' } } } = opts;
  const feedbackRequests: unknown[] = [];

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
  await page.route('**/api/decisiones**', route => json(route, {
    resumen: null,
    veredicto: { tipo: 'SIN_ANALIZAR', recomendacion: null, fraseConfianza: null, semanaTranquila: false },
    seguimiento: [], prioridades: [], masSituaciones: [], porEspecialista: [], actividad: [],
  }));
  await page.route('**/api/growth/review-boost/feedback', route => {
    feedbackRequests.push(route.request().postDataJSON());
    return json(route, feedbackPost.body, feedbackPost.status);
  });

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, {
    id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID,
    review_boost_elegible_en: elegible ? '2026-08-20T06:00:00Z' : null,
    review_boost_mostrado_en: mostrado ? '2026-08-20T07:00:00Z' : null,
    review_boost_pospuesto_en: null,
    review_boost_veces_mostrado: 0,
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
  return { feedbackRequests };
}

test.describe('Review Boost — modal tras el trial', () => {
  test('estudio elegible: aparece el modal de valoración', async ({ page }) => {
    await montarDashboard(page, { elegible: true });
    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toBeVisible({ timeout: 30_000 });
  });

  test('estudio NO elegible: el dashboard carga normal y el modal no aparece', async ({ page }) => {
    await montarDashboard(page, { elegible: false });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toHaveCount(0);
  });

  test('ya mostrado antes: no se repite en una nueva carga', async ({ page }) => {
    await montarDashboard(page, { elegible: true, mostrado: true });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toHaveCount(0);
  });

  test('5 estrellas: feedback enviado con rating correcto, recompensa mostrada, e invitación SIN condicionar', async ({ page }) => {
    const { feedbackRequests } = await montarDashboard(page, { elegible: true });
    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('radio', { name: '5 estrellas' }).click();

    await expect(page.getByText('Nos alegra mucho saberlo ❤️')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/20% de descuento en tu primer/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Reseñar en Capterra/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Reseñar en GetApp/ })).toBeVisible();

    // El copy nunca condiciona el descuento al clic externo — es el requisito
    // de cumplimiento de Capterra/GetApp/Software Advice (ver plan).
    await expect(page.getByText(/descuento.*por (dejar|escribir).*rese/i)).toHaveCount(0);

    expect(feedbackRequests).toEqual([{ rating: 5, comentario: undefined }]);

    const capterraHref = await page.getByRole('link', { name: /Reseñar en Capterra/ }).getAttribute('href');
    expect(capterraHref).toContain('reviews.capterra.com');
    const getappHref = await page.getByRole('link', { name: /Reseñar en GetApp/ }).getAttribute('href');
    expect(getappHref).toContain('reviews.getapp.com');
  });

  test('2 estrellas: va a feedback interno, SIN recompensa ni plataformas externas', async ({ page }) => {
    const { feedbackRequests } = await montarDashboard(page, { elegible: true });
    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('radio', { name: '2 estrellas' }).click();
    await expect(page.getByText('Queremos hacerlo mejor')).toBeVisible();
    await expect(page.getByText(/20% de descuento/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Reseñar en/ })).toHaveCount(0);

    await page.getByPlaceholder('Lo que quieras contarnos (opcional)').fill('El calendario tarda en cargar.');
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText('¿Qué te está pareciendo Tentare?')).toHaveCount(0);
    await expect(page.getByText('Queremos hacerlo mejor')).toHaveCount(0);
    expect(feedbackRequests).toEqual([{ rating: 2, comentario: 'El calendario tarda en cargar.' }]);
  });
});
