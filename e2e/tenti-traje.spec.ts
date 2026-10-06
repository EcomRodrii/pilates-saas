import { test, expect, type Page } from '@playwright/test';
import { montarHome, json } from './hoy-home-mock';
import { HUELLA_DEL_MOTOR, recolectarScripts } from './recolector-scripts';

// ─────────────────────────────────────────────────────────────────────────────
// El gorro de bruja (lib/tenti/trajes.ts): Tenti lo lleva del 5 de octubre al 1
// de noviembre, en hora de Madrid, y es el de Coucou tal cual
// (lib/tenti/trajes-coucou.ts). Los bordes de la temporada los prueba
// lib/tenti/trajes.test.ts y el dibujo trajes-coucou.test.ts; aquí, lo que se
// ve en el panel:
//   · lo lleva donde se toca (la tira de Hoy, «Tentare lo está haciendo», el
//     buscador ⌘K) y NO dentro de un botón o un
//     enlace («Sistema autónomo» de Resumen): la misma regla que decide si se
//     toca;
//   · 'ninguno' en este navegador se lo quita en todas partes;
//   · con traje el canvas crece hacia fuera y la caja del icono no se mueve;
//   · sin canvas 2D, el SVG de reserva va SIN traje y la caja no cambia;
//   · /interno/tenti: todos los trajes de Coucou, su hoja de seis vistas y el
//     traje de ESTE navegador.
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
  // El gorro de Coucou no cabe en el cuadro: el canvas crece hacia arriba y a
  // los lados, y la caja del icono sigue midiendo el cuerpo (28 px en la tira).
  const [caja, lienzo] = await Promise.all([tira(page).boundingBox(), tira(page).locator('canvas[data-tenti]').boundingBox()]);
  expect(caja!.width).toBeCloseTo(28, 0);
  expect(lienzo!.y).toBeLessThan(caja!.y - 10);
  expect(lienzo!.height).toBeGreaterThan(lienzo!.width);
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

test('sin canvas 2D, el SVG de reserva va sin traje, y la caja mide el cuerpo', async ({ page }) => {
  await sinCanvas2D(page);
  await conTraje(page, 'bruja');
  const scripts = recolectarScripts(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await expect(tira(page)).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);

  // La reserva solo se ve mientras llega el motor: va sin traje (un gorro
  // redibujado en SVG sería otra vez uno que solo se parece al de Coucou).
  const svg = tira(page).locator('svg[data-tenti-svg]');
  await expect(svg).toHaveCount(1);
  await expect(page.locator('[data-gorro]')).toHaveCount(0);
  await expect(autonomo(page).locator('svg[data-tenti-svg]')).toHaveCount(1);

  // La caja y el SVG miden el CUERPO: 28 px de ancho (la tira lleva el icono de 28).
  const [caja, dibujo] = await Promise.all([tira(page).boundingBox(), svg.boundingBox()]);
  expect(caja!.width).toBeCloseTo(28, 0);
  expect(Math.abs(caja!.x - dibujo!.x)).toBeLessThan(0.6);
  expect(Math.abs(caja!.y - dibujo!.y)).toBeLessThan(0.6);
  expect(Math.abs(caja!.width - dibujo!.width)).toBeLessThan(0.6);
  expect(Math.abs(caja!.height - dibujo!.height)).toBeLessThan(0.6);
});

test('/interno/tenti: todos los trajes de Coucou, su hoja de seis vistas y el traje de este navegador', async ({ page }) => {
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
  // Todos los del original, uno a uno.
  const TODOS = {
    'Gorro de lana': 'gorroDeLana', 'Gorro de Papá Noel': 'papaNoel', 'Gorro de fiesta': 'fiesta', Corona: 'corona',
    'Gafas de sol': 'gafasDeSol', 'Gafas redondas': 'gafasRedondas', Bufanda: 'bufanda', Calabaza: 'calabaza', Lazo: 'lazo',
    'Gorro de bruja': 'bruja',
  };
  for (const [etiqueta, clave] of Object.entries(TODOS)) {
    await traje.getByRole('button', { name: etiqueta, exact: true }).click();
    await expect(grande).toHaveAttribute('data-traje', clave);
  }

  // La hoja de sheet.html: seis vistas y el icono, del traje elegido; y todos a la vez.
  const hoja = page.locator('[data-hoja-traje]');
  await expect(hoja.locator('canvas[data-tenti][data-traje="bruja"]')).toHaveCount(7, { timeout: 30_000 });
  await hoja.getByRole('button', { name: 'Todos los trajes' }).click();
  await expect(hoja.locator('[data-fila-traje]')).toHaveCount(11);
  await expect(hoja.locator('canvas[data-tenti]')).toHaveCount(77, { timeout: 30_000 });
  await expect(hoja.locator('[data-fila-traje="ninguno"] canvas[data-traje]')).toHaveCount(0);

  // Lo de este navegador va a localStorage, y lo lee el panel.
  const navegador = page.getByRole('group', { name: 'En este navegador, el panel lleva' });
  const guardado = () => page.evaluate(() => localStorage.getItem('tenti-traje'));
  await navegador.getByRole('button', { name: 'Gorro de bruja' }).click();
  await expect(navegador.getByRole('button', { name: 'Gorro de bruja' })).toHaveAttribute('aria-pressed', 'true');
  expect(await guardado()).toBe('bruja');
  await navegador.getByRole('button', { name: 'Lazo' }).click();
  expect(await guardado()).toBe('lazo');
  await navegador.getByRole('button', { name: 'Nunca' }).click();
  expect(await guardado()).toBe('ninguno');
  await navegador.getByRole('button', { name: 'El de temporada' }).click();
  expect(await guardado()).toBeNull();
  await expect(page.getByText(/por temporada: gorro de bruja del 5 de octubre al 1 de noviembre \(hora\s+de Madrid\)/)).toBeVisible();
});
