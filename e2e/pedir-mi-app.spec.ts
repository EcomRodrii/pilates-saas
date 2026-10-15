import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { DEFAULT_THEME } from '../lib/theme-schema';

// «Tu app en la App Store» (Apariencia de tu app, `APP_PROPIA_PEDIR`): pedir la app con el nombre y
// el icono del estudio y ver en qué punto va. Cada camino cuenta las peticiones que hace de verdad:
// un «apagado» o un «no te deja» sin contador pasan en verde por no haber intentado nada.

const json = (r: Route, cuerpo: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

const INTERRUPTORES = { filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false, nivelesConRitmo: false, tarjetaClase: false, panelNuevo: false };

interface Datos { planIncluye: boolean; esPropietaria: boolean; nombreSugerido: string; app: unknown }
const SIN_PEDIR: Datos = { planIncluye: true, esPropietaria: true, nombreSugerido: 'Pilates Centro', app: null };
const app = (estado: string, extra: Record<string, unknown> = {}) => ({
  estado, nombreApp: 'Pilates Centro', bundleId: 'app.tentare.pilates-centro', urlTienda: null, pedidaEn: '2026-10-15T08:00:00Z', ...extra,
});

async function preparar(page: Page, opciones: { encendido: boolean; datos?: Datos; post?: () => { status: number; cuerpo: unknown } }) {
  await montar(page);
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
    plan: 'ESTUDIO', subscription_status: 'active', moneda: 'EUR', iva_por_defecto: 21,
  }));
  await page.route((u) => u.pathname === '/api/theme', (r) => json(r, { ...DEFAULT_THEME, primary: '#666DCC' }));
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { ...INTERRUPTORES, pedirApp: opciones.encendido }));
  const n = { lecturas: 0, peticiones: [] as { nombreApp?: string }[] };
  await page.route((u) => u.pathname === '/api/estudio/app-movil', async (r) => {
    if (r.request().method() === 'POST') {
      n.peticiones.push(r.request().postDataJSON() as { nombreApp?: string });
      const x = opciones.post?.() ?? { status: 201, cuerpo: { app: app('PEDIDA', { nombreApp: (r.request().postDataJSON() as { nombreApp: string }).nombreApp }) } };
      return json(r, x.cuerpo, x.status);
    }
    n.lecturas++;
    return json(r, opciones.datos ?? SIN_PEDIR);
  });
  return n;
}

const abrir = async (page: Page) => {
  await ir(page, 'configuracion/apariencia');
  await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
};

test.describe('Pedir mi app', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1440, height: 950 } });

  test('apagado de serie: la sección no existe y no se pregunta nada', async ({ page }) => {
    const n = await preparar(page, { encendido: false });
    await abrir(page);
    // La sección de instalar sí está (es lo de siempre): sirve de testigo de que la página ya pintó.
    await expect(page.getByTestId('app-en-el-movil')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Tu app en la App Store' })).toHaveCount(0);
    expect(n.lecturas).toBe(0);
  });

  test('encendido: se pide con el nombre elegido y se enseña «Pedida»', async ({ page }) => {
    const n = await preparar(page, { encendido: true });
    await abrir(page);
    const nombre = page.getByTestId('nombre-app-pedir');
    await expect(nombre).toHaveValue('Pilates Centro', { timeout: 30_000 });
    await expect(page.getByTestId('mi-app-pedir')).toContainText('Apple la revisa');

    // Un nombre largo avisa de que se recorta (no lo impide).
    await nombre.fill('Pilates Centro Madrid Sur');
    await expect(page.getByText(/se verá recortado/)).toBeVisible();
    await nombre.fill('Luz');
    await page.getByTestId('pedir-app').click();

    await expect(page.getByTestId('mi-app-estado')).toHaveAttribute('data-estado', 'PEDIDA', { timeout: 30_000 });
    await expect(page.getByTestId('mi-app-estado')).toContainText('Pedida');
    await expect(page.getByTestId('mi-app-estado')).toContainText('«Luz»');
    // Pidió de verdad, una vez, con el nombre elegido y SIN estudio en el cuerpo (sale de la sesión).
    expect(n.peticiones).toEqual([{ nombreApp: 'Luz' }]);
  });

  test('sin nombre no se pide (el botón no sale)', async ({ page }) => {
    const n = await preparar(page, { encendido: true });
    await abrir(page);
    await page.getByTestId('nombre-app-pedir').fill('   ');
    await expect(page.getByTestId('pedir-app')).toBeDisabled();
    expect(n.peticiones).toHaveLength(0);
  });

  test('el servidor dice que no: lo dice y NO finge que está pedida', async ({ page }) => {
    const n = await preparar(page, { encendido: true, post: () => ({ status: 403, cuerpo: { error: 'Tu plan no incluye la app propia. Está en Estudio y Cadena.' } }) });
    await abrir(page);
    await expect(page.getByTestId('nombre-app-pedir')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('pedir-app').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Tu plan no incluye la app propia' })).toBeVisible({ timeout: 30_000 });
    expect(n.peticiones.length).toBeGreaterThan(0);
    await expect(page.getByTestId('mi-app-estado')).toHaveCount(0);
    await expect(page.getByTestId('pedir-app')).toBeEnabled();
  });

  test('su plan no la incluye: lo dice con los planes del catálogo y no deja pedirla', async ({ page }) => {
    const n = await preparar(page, { encendido: true, datos: { ...SIN_PEDIR, planIncluye: false } });
    await abrir(page);
    const aviso = page.getByTestId('mi-app-sin-plan');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText('Estudio y Cadena');
    await expect(aviso).not.toContainText('Founding');
    await expect(page.getByTestId('pedir-app')).toHaveCount(0);
    expect(n.lecturas).toBeGreaterThan(0);
    expect(n.peticiones).toHaveLength(0);
  });

  test('quien no es la propietaria la ve, pero no la pide', async ({ page }) => {
    const n = await preparar(page, { encendido: true, datos: { ...SIN_PEDIR, esPropietaria: false } });
    await abrir(page);
    await expect(page.getByTestId('mi-app-solo-propietaria')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pedir-app')).toHaveCount(0);
    expect(n.peticiones).toHaveLength(0);
  });

  test('ya pedida (otra pestaña): enseña la que hay, no un segundo formulario', async ({ page }) => {
    await preparar(page, { encendido: true, datos: { ...SIN_PEDIR, app: app('EN_REVISION') } });
    await abrir(page);
    const estado = page.getByTestId('mi-app-estado');
    await expect(estado).toHaveAttribute('data-estado', 'EN_REVISION', { timeout: 30_000 });
    await expect(estado).toContainText('Apple la está revisando');
    // No promete plazos ni avisos.
    await expect(estado).not.toContainText(/te avisamos|días|semanas/i);
    await expect(page.getByTestId('pedir-app')).toHaveCount(0);
  });

  test('publicada: enlace a la tienda y su QR', async ({ page }) => {
    await preparar(page, { encendido: true, datos: { ...SIN_PEDIR, app: app('PUBLICADA', { urlTienda: 'https://apps.apple.com/es/app/pilates-centro/id123' }) } });
    await abrir(page);
    await expect(page.getByTestId('enlace-tienda')).toHaveAttribute('href', 'https://apps.apple.com/es/app/pilates-centro/id123', { timeout: 30_000 });
    await expect(page.getByTestId('qr-tienda').locator('svg')).toBeVisible();
  });
});
