import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Créditos por acción» en el panel nuevo (interruptor `panelNuevo`), como
// «Gamificación» de Bonsai: las acciones en grupos (Clases, Compras, Amigas) y
// cada una en su fila con el interruptor a la izquierda y «Suma [n] créditos» a
// la derecha. Las reglas de siempre: escribir un número enciende la acción, nada
// se escribe hasta «Guardar», y con un 500 el cajón se queda con el error.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const STUDIO_ID = 'studio-test';
const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', creditos_nombre: null, creditos_caducan_meses: null, racha_clases_semana: null,
};
const REGLAS = [{
  id: 'rwr-1', studio_id: STUDIO_ID, trigger: 'ASISTENCIA_CLASE', nombre: 'Asistir a clase', descripcion: null,
  creditos: 10, activa: true, tope_mensual: null, unidad_euros: null, creado_en: '2026-01-01T00:00:00Z',
}];

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, opts: { falloReglas?: 500 } = {}) {
  const reglas: { metodo: string; cuerpo: unknown }[] = [];
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route('**/rest/v1/studios**', r => json(r, FILA));
  await page.route('**/rest/v1/reward_rules**', r => {
    if (r.request().method() === 'GET') return json(r, REGLAS);
    reglas.push({ metodo: r.request().method(), cuerpo: r.request().postDataJSON() });
    if (opts.falloReglas === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: 'rwr-nueva' }]);
  });
  await ir(page, 'configuracion?tab=motivacion#creditos-por-accion');
  const cajon = page.getByRole('dialog').first();
  await expect(cajon.getByRole('heading', { level: 2, name: 'Créditos por acción', exact: true })).toBeVisible({ timeout: 30_000 });
  return { reglas, cajon };
}

const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });

test('las acciones van en grupos, cada una con su interruptor y lo que suma', async ({ page }) => {
  const { cajon } = await abrir(page);
  for (const g of ['Clases', 'Compras', 'Amigas']) await expect(cajon.getByRole('region', { name: g })).toBeVisible();
  const clases = cajon.getByRole('region', { name: 'Clases' });
  await expect(clases.getByRole('switch', { name: 'Asistir a clase' })).toHaveAttribute('aria-checked', 'true');
  await expect(clases.getByRole('spinbutton', { name: 'Créditos por Asistir a clase' })).toHaveValue('10');
  // Las siete del catálogo, ni una de menos.
  await expect(cajon.getByRole('switch')).toHaveCount(7);
});

test('escribir lo que suma enciende la acción y se guarda con UNA escritura', async ({ page }) => {
  const { reglas, cajon } = await abrir(page);
  const interruptor = cajon.getByRole('switch', { name: 'Renovar plan' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await cajon.getByRole('spinbutton', { name: 'Créditos por Renovar plan' }).fill('30');
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  expect(reglas, 'escribir no guarda nada').toHaveLength(0);
  await guardar(page).click();
  await expect(page.getByText('Créditos por acción guardados')).toBeVisible({ timeout: 10_000 });
  expect(reglas).toHaveLength(1);
  expect(reglas[0]).toMatchObject({ metodo: 'POST', cuerpo: { trigger: 'RENOVACION_PLAN', creditos: 30, activa: true } });
});

test('con un 500 no dice «guardados» y lo escrito se queda', async ({ page }) => {
  const { reglas, cajon } = await abrir(page, { falloReglas: 500 });
  await cajon.getByRole('spinbutton', { name: 'Créditos por Renovar plan' }).fill('30');
  await guardar(page).click();
  await expect(cajon.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  expect(reglas.length, 'intentos de escribir').toBeGreaterThan(0);
  await expect(page.getByText('Créditos por acción guardados')).toHaveCount(0);
  await expect(cajon.getByRole('spinbutton', { name: 'Créditos por Renovar plan' })).toHaveValue('30');
});
