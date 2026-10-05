import { test, expect, type Page } from '@playwright/test';
import { montarHome, json } from './hoy-home-mock';
import { montar, ir } from './panel-sembrado';
import { HUELLA_DEL_MOTOR, recolectarScripts } from './recolector-scripts';

// ─────────────────────────────────────────────────────────────────────────────
// El gorro de bruja (lib/tenti/trajes.ts): Tenti lo lleva del 5 de octubre al 1
// de noviembre, en hora de Madrid. Los bordes de la temporada los prueba
// lib/tenti/trajes.test.ts; aquí, lo que se ve en el panel:
//   · lo lleva donde se toca (la tira de Hoy, «Tentare lo está haciendo», el
//     resumen de Automatizaciones, el buscador ⌘K) y NO dentro de un botón o un
//     enlace («Sistema autónomo» de Resumen): la misma regla que decide si se
//     toca;
//   · 'ninguno' en este navegador se lo quita en todas partes;
//   · sin canvas 2D, el SVG de reserva lleva el mismo gorro y la caja no cambia;
//   · /interno/tenti fija el traje de ESTE navegador.
// Los arneses fijan el reloj en septiembre (fuera de temporada), así que cada
// test pide el gorro (o lo quita) por localStorage: no depende del día en que
// corra.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const BANDEJA_CON_MARCHA = {
  aplica: true, nDecidir: 0, titulo: 'Nada espera tu visto bueno', decidir: [],
  enMarcha: [{ id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' }],
  resuelto: [],
};

const conTraje = (page: Page, valor: 'bruja' | 'ninguno') =>
  page.addInitScript((v) => localStorage.setItem('tenti-traje', v), valor);

const sinCanvas2D = (page: Page) => page.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
    if (tipo === '2d') return null;
    return (original as (...a: unknown[]) => RenderingContext | null).call(this, tipo, ...resto);
  } as typeof HTMLCanvasElement.prototype.getContext;
});

const tira = (page: Page) => page.getByText(/^Tentare ha encontrado/).locator('xpath=..').locator('[data-tenti-icono]');
const enMarcha = (page: Page) => page.getByRole('region', { name: 'Lo que espera tu visto bueno' })
  .getByText('Tentare lo está haciendo').locator('[data-tenti-icono]');
const autonomo = (page: Page) => page.getByRole('link', { name: /Sistema autónomo/ }).locator('[data-tenti-icono]');

test('Resumen con el gorro: en la tira de Hoy y en la bandeja sí, en el enlace «Sistema autónomo» no; y en el buscador', async ({ page }) => {
  await conTraje(page, 'bruja');
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await expect(tira(page)).toHaveCount(1, { timeout: 60_000 });

  for (const icono of [tira(page), enMarcha(page)]) {
    await expect(icono).toHaveAttribute('data-traje', 'bruja');
    await expect(icono.locator('canvas[data-tenti]')).toHaveAttribute('data-traje', 'bruja', { timeout: 30_000 });
  }
  // Dentro de un enlace: ni se toca ni lleva traje.
  await expect(autonomo(page)).toHaveCount(1);
  await expect(autonomo(page).locator('canvas[data-tenti]')).toHaveCount(1, { timeout: 30_000 });
  await expect(autonomo(page)).not.toHaveAttribute('data-traje');
  await expect(autonomo(page).locator('canvas[data-tenti]')).not.toHaveAttribute('data-traje');

  // El buscador ⌘K: el decorativo lo lleva.
  await page.keyboard.press('ControlOrMeta+k');
  const hoja = page.getByRole('dialog', { name: 'Buscar' });
  await expect(hoja.locator('canvas[data-tenti]')).toHaveAttribute('data-traje', 'bruja', { timeout: 30_000 });
});

test("con 'ninguno' en este navegador, ningún Tenti lleva traje", async ({ page }) => {
  await conTraje(page, 'ninguno');
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await expect(tira(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(tira(page).locator('canvas[data-tenti]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(3);
  await expect(page.locator('[data-traje]')).toHaveCount(0);
});

test('Automatizaciones con el gorro: el Tenti del resumen y el de «Esto ya lo hace Tentare»', async ({ page }) => {
  await conTraje(page, 'bruja');
  await montar(page);
  await ir(page, 'automatizaciones');
  await expect(page.getByText(/^Ninguna automatización espera tu visto bueno\./)).toBeVisible({ timeout: 60_000 });
  const briefing = page.locator('div.rounded-2xl.bg-primary', { has: page.getByRole('heading', { level: 1 }) });
  // El decorativo de 56 px (el sitio del Zap) y el icono de la fila, que no va en un control.
  await expect(briefing.locator('canvas[data-tenti][data-traje="bruja"]')).toHaveCount(2, { timeout: 30_000 });
});

test('sin canvas 2D, el SVG de reserva lleva el gorro, y la caja mide lo mismo que sin él', async ({ page }) => {
  await sinCanvas2D(page);
  await conTraje(page, 'bruja');
  const scripts = recolectarScripts(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await expect(tira(page)).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);

  const svg = tira(page).locator('svg[data-tenti-svg]');
  await expect(svg.locator('[data-gorro="bruja"]')).toHaveCount(1);
  // En el enlace, el SVG va sin gorro.
  await expect(autonomo(page).locator('svg[data-tenti-svg]')).toHaveCount(1);
  await expect(autonomo(page).locator('[data-gorro]')).toHaveCount(0);

  // La caja y el SVG miden el CUERPO, como sin gorro: 28 px de ancho (la tira
  // lleva el icono de 28), y el gorro se sale por arriba.
  const [caja, dibujo, gorro] = await Promise.all([tira(page).boundingBox(), svg.boundingBox(), svg.locator('[data-gorro]').boundingBox()]);
  expect(caja!.width).toBeCloseTo(28, 0);
  expect(Math.abs(caja!.x - dibujo!.x)).toBeLessThan(0.6);
  expect(Math.abs(caja!.y - dibujo!.y)).toBeLessThan(0.6);
  expect(Math.abs(caja!.width - dibujo!.width)).toBeLessThan(0.6);
  expect(Math.abs(caja!.height - dibujo!.height)).toBeLessThan(0.6);
  expect(gorro!.y).toBeLessThan(caja!.y);
});

test('/interno/tenti: el traje del catálogo y el de este navegador', async ({ page }) => {
  await page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: 'equipo@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, ['sb-example-auth-token', 'auth-e2e-equipo'] as const);
  await page.route('**/rest/v1/**', (r) => json(r, []));
  let sesiones = 0;
  await page.route('**/api/interno/sesion**', (r) => {
    sesiones++;
    return json(r, { nombre: 'Equipo', cargo: 'Fundador', email: 'equipo@example.com', permisos: ['admin.full'] });
  });
  await page.goto('/interno/tenti');
  await expect(page.getByRole('heading', { name: 'Tenti', level: 1 })).toBeVisible({ timeout: 60_000 });
  expect(sesiones).toBeGreaterThan(0);

  // El grande del catálogo empieza con el gorro y se lo quita a mano.
  const grande = page.getByRole('img', { name: /^Tenti:/ });
  await expect(grande).toHaveAttribute('data-traje', 'bruja', { timeout: 30_000 });
  const traje = page.getByRole('group', { name: 'Traje' });
  await traje.getByRole('button', { name: 'Sin traje' }).click();
  await expect(grande).not.toHaveAttribute('data-traje');
  await traje.getByRole('button', { name: 'Gorro de bruja' }).click();
  await expect(grande).toHaveAttribute('data-traje', 'bruja');

  // Lo de este navegador va a localStorage, y lo lee el panel.
  const navegador = page.getByRole('group', { name: 'En este navegador, el panel lleva' });
  const guardado = () => page.evaluate(() => localStorage.getItem('tenti-traje'));
  await navegador.getByRole('button', { name: 'Siempre el gorro' }).click();
  await expect(navegador.getByRole('button', { name: 'Siempre el gorro' })).toHaveAttribute('aria-pressed', 'true');
  expect(await guardado()).toBe('bruja');
  await navegador.getByRole('button', { name: 'Nunca' }).click();
  expect(await guardado()).toBe('ninguno');
  await navegador.getByRole('button', { name: 'El de temporada' }).click();
  expect(await guardado()).toBeNull();
  await expect(page.getByText(/el gorro de bruja sale del 5 de octubre al 1 de noviembre \(hora\s+de Madrid\)/)).toBeVisible();
});
