import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-8, lado clienta. Un reformer con ventana de cancelación propia (24h) en
// un estudio cuya política general es más laxa (12h): la hoja de reserva
// tiene que avisar de la ventana REAL de esa clase, no de la del estudio —
// decirle 12h cuando en realidad son 24 le haría cancelar tarde sin saberlo.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const FECHA = '2026-07-09';
const AHORA = `${FECHA}T08:00:00`;

function studioDataFixture() {
  const hoy = FECHA;
  return {
    studio: {
      id: 'studio-test', nombre: 'Tentare', slug: SLUG, ciudad: 'Málaga', direccion: 'Calle Test 1',
      email: 'hola@tentare.app', telefono: '+34 000 000 000', cancelacionVentanaHoras: 12,
      reservaAntelacionMaximaDias: 30,
    },
    // Reformer con ventana PROPIA de 24h; Mat sin override, hereda las 12h del estudio.
    tiposClase: [
      { id: 'tc-reformer', studioId: 'studio-test', nombre: 'Reformer', color: '#F7A6C4', nivel: 'TODOS', ventanaCancelacionHoras: 24 },
      { id: 'tc-mat', studioId: 'studio-test', nombre: 'Mat', color: '#6D28D9', nivel: 'TODOS', ventanaCancelacionHoras: null, reservaAntelacionMaximaDias: 14 },
    ],
    salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Ana Test', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'plan-test', studioId: 'studio-test', nombre: 'Mensual Ilimitado', descripcion: 'Clases ilimitadas', precio: 85, tipo: 'MENSUAL', sesiones: null, activo: true }],
    sesiones: [
      { id: 'ses-reformer', studioId: 'studio-test', tipoClaseId: 'tc-reformer', salaId: 'sala-1', instructorId: 'ins-1', inicio: `${hoy}T10:00:00`, fin: `${hoy}T11:00:00`, aforoMaximo: 10, cancelada: false },
      { id: 'ses-mat', studioId: 'studio-test', tipoClaseId: 'tc-mat', salaId: 'sala-1', instructorId: 'ins-1', inicio: `${hoy}T12:00:00`, fin: `${hoy}T13:00:00`, aforoMaximo: 10, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], aforoReservas: [],
    socia: null,
  };
}

async function seedSession(page: Page, email: string) {
  await page.addInitScript(([e]) => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: e, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [email]);
}

async function mockBackend(page: Page) {
  await page.route('**/rest/v1/studios*', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      } });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'studio-test' }),
    });
  });

  await page.route('**/api/public/studio-data', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioDataFixture()) }));

  await page.route('**/api/public/session', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No hay ninguna socia con este email en el estudio' }) }));
}

test.describe('La ventana de cancelación que se enseña es la de la clase, no siempre la del estudio', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(AHORA) });
  });

  test('Reformer (24h propias) avisa de 24h, no de las 12h del estudio', async ({ page }) => {
    await seedSession(page, 'socia-e2e@test.com');
    await mockBackend(page);
    await page.goto(`/reservar/${SLUG}`);

    await page.getByRole('tab', { name: /9 de julio/i }).click();
    await page.getByRole('button', { name: /Reformer a las/i }).click();

    // ⚠️ Rediseño "sin popup": la ficha ya no es `role="dialog"` — sustituye
    // el listado en el sitio de siempre, así que no hace falta acotar contra
    // ninguna otra cosa visible detrás.
    await expect(page.getByText(/Cancela con al menos 24h de antelación/)).toBeVisible();
    await expect(page.getByText(/Cancela con al menos 12h de antelación/)).toHaveCount(0);
  });

  test('Mat (sin override) hereda las 12h del estudio', async ({ page }) => {
    await seedSession(page, 'socia-e2e@test.com');
    await mockBackend(page);
    await page.goto(`/reservar/${SLUG}`);

    await page.getByRole('tab', { name: /9 de julio/i }).click();
    await page.getByRole('button', { name: /Mat a las/i }).click();

    await expect(page.getByText(/Cancela con al menos 12h de antelación/)).toBeVisible();
    await expect(page.getByText(/Cancela con al menos 24h de antelación/)).toHaveCount(0);
  });

  // ⚠️ El mismo estudio, mirado SIN abrir ninguna clase. La caja «Cómo
  // funciona» leía `studios.cancelacion_ventana_horas` a secas, así que con
  // este fixture prometía 12 h mientras el Reformer exigía 24: quien lo leyera
  // ahí y cancelara a 18 h perdería la clase. Ahora anuncia el plazo más
  // estricto y avisa de que depende de la clase.
  test('⚠️ «Cómo funciona» no promete las 12 h del estudio cuando una clase exige 24', async ({ page }) => {
    await mockBackend(page);
    await page.goto(`/reservar/${SLUG}`);
    await expect(page.getByText('CÓMO FUNCIONA')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cancela gratis hasta 24 h antes, según la clase.')).toBeVisible();
    await expect(page.getByText(/Cancela gratis hasta 12/)).toHaveCount(0);
  });

  // ⚠️ Misma familia de fallo que la de arriba, en la otra dirección. El tope
  // de antelación solo aparecía como error DESPUÉS de pulsar («Todavía no se
  // puede reservar esta clase»), sin decir cuándo sí. Y aquí el número seguro
  // es el MÁS CORTO —14, no los 30 del estudio— porque la regla tiene la forma
  // contraria: quien reserve a 14 días llega a las dos clases.
  test('⚠️ el tope de antelación se anuncia, y con el número más CORTO', async ({ page }) => {
    await mockBackend(page);
    await page.goto(`/reservar/${SLUG}`);
    await expect(page.getByText('CÓMO FUNCIONA')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('El horario se abre 14 días antes, según la clase.')).toBeVisible();
    await expect(page.getByText(/se abre 30 días/)).toHaveCount(0);
  });
});
