import { test, expect, type Page, type Route } from '@playwright/test';
import { HUELLA_DEL_MOTOR, recolectarScripts } from './recolector-scripts';
import { contarFotogramas } from './contador-fotogramas';
import { espiarSonidos } from './espia-sonidos';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti aparece al abrir el buscador ⌘K («¿Qué quieres hacer o buscar?»), en el
// sitio de la lupa (decisión del fundador del 5-oct). Lo que se fija aquí:
//   · sale al abrir con el botón y con el atajo, en la fila del input, en
//     reposo y decorativo; al cerrar se va, y no deja ni un fotograma ni un
//     temporizador vivo (un despertador olvidado pintaría al dispararse);
//   · sin canvas 2D se ve la lupa de siempre y la búsqueda funciona;
//   · lo ve también recepción: el buscador es de todos;
//   · en oscuro lee los tokens oscuros (la hoja va al anfitrión del panel);
//   · el motor no viaja con el panel: llega al abrir la hoja;
//   · NO suena (fundador, 6-oct-2026: «quítale el sonido a Tenti»): ni al
//     abrirse, ni al cerrarse, ni al tocarlo (que no le quita el foco al campo),
//     ni al parpadear.
// Se monta en Clientas y no en Resumen: Resumen lleva sus propios Tentis vivos
// (tres iconos), y aquí se cuenta lo que hace el del buscador.
// Dónde puede ir y con qué props lo vigila lib/tenti/donde-vive-tenti.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

// En local cada pantalla se compila la primera vez que se pide.
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const YO = 'auth-e2e-yo';

const json = (r: Route, body: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * El panel con todo mockeado, en /clientas (una pantalla sin Tenti propio). Sin reloj falso a propósito: el
 * motor anima con performance.now() y aquí se cuentan sus fotogramas.
 * Con otro rol, la dueña es otra persona y el rol sale de la fila de quien
 * entra en `instructores`, como en producción.
 */
async function montar(page: Page, { rol = 'PROPIETARIO' as 'PROPIETARIO' | 'RECEPCION' } = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'yo@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, YO] as const);
  // El genérico PRIMERO: la última ruta registrada gana.
  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', moneda: 'EUR', email: 'estudio@example.com',
    owner_auth_user_id: rol === 'PROPIETARIO' ? YO : 'auth-e2e-otra-duena',
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', (r) => json(r, rol === 'PROPIETARIO' ? [] : [{
    id: 'ins-yo', studio_id: STUDIO_ID, nombre: 'Ana Mostrador', activo: true, rol, color: '#8B7355',
    auth_user_id: YO, email: 'ana@example.com', telefono: null,
  }]));
  await page.goto('/clientas');
}

const boton = (page: Page) => page.getByRole('button', { name: /Qué quieres hacer o buscar/ });
const hoja = (page: Page) => page.getByRole('dialog', { name: 'Buscar' });
const campo = (page: Page) => page.getByPlaceholder('¿Qué quieres hacer? O busca una clienta, clase o pago…');
const tenti = (page: Page) => hoja(page).locator('canvas[data-tenti]');
const lupa = (page: Page) => hoja(page).locator('svg.lucide-search');

/** Tenti en la MISMA fila que el input, y no la lupa: en su sitio, no sumado. */
async function tentiEnLaFila(page: Page) {
  await expect(tenti(page)).toHaveCount(1, { timeout: 30_000 });
  const fila = campo(page).locator('xpath=..');
  await expect(fila.locator('canvas[data-tenti]')).toHaveCount(1);
  await expect(lupa(page)).toHaveCount(0);
  await expect(tenti(page)).toHaveAttribute('data-estado', 'reposo');
  await expect(tenti(page)).toHaveAttribute('aria-hidden', 'true');
}

test('al abrir el buscador con el botón aparece Tenti; al cerrarlo se va sin dejar nada vivo', async ({ page }) => {
  const fotogramas = await contarFotogramas(page);
  await montar(page);
  await boton(page).click({ timeout: 60_000 });
  await expect(campo(page)).toBeVisible();
  await tentiEnLaFila(page);
  // El nombre de la hoja sigue siendo el suyo: Tenti es decorativo.
  await expect(page.getByRole('dialog', { name: /Tenti/i })).toHaveCount(0);

  // Vivo pero dormido entre parpadeos: algo pinta, muy por debajo de 60 fps.
  await page.waitForTimeout(1_000);
  const abierto = await fotogramas.durante(6_000);
  expect(abierto.pintados).toBeGreaterThan(0);
  expect(abierto.pintados).toBeLessThan(150);

  // Escribir no lo cambia de estado: mira hacia el texto, nada más.
  await campo(page).fill('Calendario');
  await expect(hoja(page).getByText('Secciones')).toBeVisible();
  await expect(tenti(page)).toHaveAttribute('data-estado', 'reposo');
  await campo(page).fill('zzzz nada que encontrar');
  await expect(hoja(page).getByText(/Sin resultados/)).toBeVisible();
  await expect(tenti(page)).toHaveAttribute('data-estado', 'reposo');

  await page.keyboard.press('Escape');
  await expect(hoja(page)).toHaveCount(0);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
  // Más que el hueco más largo entre parpadeos (5,4 s): un despertador que
  // hubiera sobrevivido al cierre ya habría pintado.
  const cerrado = await fotogramas.durante(6_000);
  expect(cerrado.pintados).toBe(0);
  expect(cerrado.raf).toBe(0);

  // Y vuelve a entrar en cada apertura.
  await boton(page).click();
  await tentiEnLaFila(page);
});

test('con el atajo ⌘K también aparece', async ({ page }) => {
  await montar(page);
  await expect(boton(page)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('ControlOrMeta+k');
  await expect(campo(page)).toBeVisible();
  await tentiEnLaFila(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
});

test('sin canvas 2D se ve la lupa de siempre y la búsqueda funciona', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
      if (tipo === '2d') return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, tipo, ...resto);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const scripts = recolectarScripts(page);
  await montar(page);
  await boton(page).click({ timeout: 60_000 });
  await expect(campo(page)).toBeVisible();
  // Que el motor haya llegado de verdad: si no, la lupa sería la de «cargando».
  await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
  await expect(lupa(page)).toHaveCount(1);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
  await campo(page).fill('Calendario');
  await expect(hoja(page).getByText('Secciones')).toBeVisible();
  await expect(hoja(page).getByRole('button', { name: /^Calendario$/ })).toBeVisible();
});

test('recepción también lo ve: el buscador es de todos', async ({ page }) => {
  await montar(page, { rol: 'RECEPCION' });
  await boton(page).click({ timeout: 60_000 });
  await expect(campo(page)).toBeVisible();
  await tentiEnLaFila(page);
  // Que entra de verdad como recepción: la sección «Equipo» no es suya y el
  // buscador no la ofrece (la propietaria sí la vería).
  await campo(page).fill('Equipo');
  await expect(hoja(page).getByText(/^Acciones$|^Clientas$|Sin resultados/).first()).toBeVisible();
  await expect(hoja(page).getByRole('button', { name: /^Equipo$/ })).toHaveCount(0);
  await expect(tenti(page)).toHaveAttribute('data-estado', 'reposo');
});

test('en oscuro Tenti lee los tokens del tema oscuro', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
  await montar(page);
  await boton(page).click({ timeout: 60_000 });
  await tentiEnLaFila(page);
  await expect(tenti(page)).toHaveAttribute('data-paleta', 'tokens');
  expect(await tenti(page).evaluate((el) => el.closest('.dark') !== null)).toBe(true);
  const cuerpo = await tenti(page).evaluate((el) => ({
    lienzo: getComputedStyle(el).getPropertyValue('--tenti-cuerpo-luz').trim(),
    raiz: getComputedStyle(document.documentElement).getPropertyValue('--tenti-cuerpo-luz').trim(),
  }));
  expect(cuerpo.lienzo).not.toBe('');
  expect(cuerpo.lienzo).not.toBe(cuerpo.raiz);
});

test('el motor no viaja con el panel: llega al abrir el buscador', async ({ page }) => {
  const scripts = recolectarScripts(page);
  await montar(page);
  await expect(boton(page)).toBeVisible({ timeout: 60_000 });
  // El buscador se precarga con el navegador libre (requestIdleCallback, hasta
  // 5 s): ni con él descargado puede venir el motor.
  await page.waitForTimeout(7_000);
  expect(await scripts.cuantos()).toBeGreaterThan(0);
  expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(false);
  // Control positivo: al abrir, sí.
  await boton(page).click();
  await tentiEnLaFila(page);
  await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
});

test('no suena: ni al abrirse, ni en reposo, ni al tocarlo (que no le quita el foco al campo), ni al cerrarse', async ({ page }) => {
  const sonidos = await espiarSonidos(page);
  await montar(page);
  await expect(boton(page)).toBeVisible({ timeout: 60_000 });

  await boton(page).click();
  await tentiEnLaFila(page);
  // Abierto y en reposo un rato: parpadea y mira alrededor, en silencio.
  await page.waitForTimeout(3_000);

  // Tocarlo: se aplasta, y el campo sigue con el foco.
  await campo(page).fill('Cal');
  for (let i = 0; i < 3; i++) await tenti(page).click();
  await expect(campo(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(hoja(page)).toHaveCount(0);
  await page.waitForTimeout(1_000);
  expect(await sonidos.cuantos(), 'Tenti no suena').toBe(0);
});
