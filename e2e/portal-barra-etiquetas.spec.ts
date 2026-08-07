import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// Barra inferior — cuántas pestañas enseñan su nombre (eje `barra` de
// lib/theme-variantes.ts). El prototipo lo decide igual: `conTexto: !tabPill
// || activo` → con píldora (Bloom y todo el mundo por defecto) solo la
// activa; con barra clásica (Oliva/Noir), las cuatro.
//
// Los tests de e2e/portal-tema-editorial.spec.ts ya fijan el comportamiento
// SIN variante (solo la activa) y son la red de seguridad de esto — no se
// tocan.

// Las pestañas REALES del portal (lib/portal-nav.ts) — el prototipo dibuja
// "Reservas" pero aquí esa pestaña es "Bonos"; cambiar el inventario del menú
// sería decisión de producto, no del tema.
const NOMBRES = ['Inicio', 'Clases', 'Bonos', 'Perfil'];

test.describe('Barra inferior — etiquetas por variante', () => {
  test('sin variante: solo la activa lleva texto, y es más ancha para hacerle sitio', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav.getByText('Inicio', { exact: true })).toBeVisible();
    for (const n of NOMBRES.slice(1)) {
      await expect(nav.getByText(n, { exact: true })).toHaveCount(0);
    }
    // La activa se ensancha (flex 2.4) — eso es lo que le hace sitio al texto.
    const cajas = await nav.locator('a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(cajas[0]).toBeGreaterThan(cajas[1]);
  });

  test('`todas` (Oliva/Noir): las cuatro con su nombre y todas del mismo ancho', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { barra: 'todas' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    for (const n of NOMBRES) {
      await expect(nav.getByText(n, { exact: true })).toBeVisible();
    }
    // Con las cuatro etiquetadas, ensanchar la activa dejaría a las otras
    // apretadas y sin motivo: reparto a partes iguales.
    const cajas = await nav.locator('a').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of cajas) expect(Math.abs(w - cajas[0])).toBeLessThan(1.5);
  });

  test('`todasRelleno` (Oliva): además, el icono activo va macizo', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { barra: 'todasRelleno' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const rellenos = await nav.locator('svg').evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).fill));
    // El primero (activo) relleno; los demás sin relleno.
    expect(rellenos[0]).not.toBe('none');
    for (const f of rellenos.slice(1)) expect(f).toBe('none');
  });

  test('sin variante, NINGÚN icono va relleno (el look de siempre)', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const rellenos = await nav.locator('svg').evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).fill));
    for (const f of rellenos) expect(f).toBe('none');
  });
});

// ── La barra de los tres temas, con el tema montado de verdad ───────────────
// Estos cuatro no miran etiquetas: miran el ESTILO CALCULADO por el navegador
// con las CSS vars del tema puestas. Es el eslabón que faltaba — hasta ahora
// todo e2e del portal corría con los fallbacks del componente, así que la
// píldora blanca con sombra pasaba por buena en los tres temas.
test.describe('Barra inferior — el estilo real de cada tema', () => {
  async function abrir(page: import('@playwright/test').Page, tema: string) {
    await montarPortal(page, { conSesion: true, tema });
    await page.goto(`/portal/${SLUG}/home`);
    // Se espera a la BARRA, no al saludo: cada tema tiene su propia cabecera
    // (`cabeceraInicio`: 'saludo'/'titular'/'nombre'), así que "Hola," solo
    // aparece en Oliva.
    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav).toBeVisible({ timeout: 30_000 });
    const activa = nav.locator('a').first();
    return { nav, activa };
  }

  test('Oliva: sin pastilla ni sombra bajo la pestaña activa', async ({ page }) => {
    const { activa } = await abrir(page, 'oliva');
    const css = await activa.evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, sombra: s.boxShadow, color: s.color };
    });
    expect(css.bg).toBe('rgba(0, 0, 0, 0)');
    expect(css.sombra).toBe('none');
    expect(css.color).toBe('rgb(61, 74, 47)'); // #3D4A2F, la marca del encargo
  });

  test('Bloom: la pastilla activa es LILA con el texto en claro, y la barra flota', async ({ page }) => {
    const { nav, activa } = await abrir(page, 'bloom');
    const pastilla = await activa.evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(pastilla.bg).toBe('rgb(124, 92, 252)');  // #7C5CFC
    expect(pastilla.color).not.toBe('rgb(255, 143, 177)'); // el rosa NO va aquí
    const barra = await nav.evaluate((e) => {
      const s = getComputedStyle(e);
      return { alto: s.height, radio: s.borderTopLeftRadius, sombra: s.boxShadow };
    });
    expect(barra.alto).toBe('66px');
    expect(parseFloat(barra.radio)).toBeGreaterThan(30); // píldora, no tarjeta
    expect(barra.sombra).not.toBe('none');
  });

  test('Noir: barra verde oscuro, activo dorado y sin línea superior', async ({ page }) => {
    const { nav, activa } = await abrir(page, 'noir');
    const barra = await nav.evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, borde: s.borderTopStyle };
    });
    expect(barra.bg).toBe('rgb(30, 43, 34)');  // #1E2B22
    expect(barra.borde).toBe('none');
    await expect(activa).toHaveCSS('color', 'rgb(217, 177, 102)'); // #D9B166
  });

  test('un estudio sin tema de esta tanda conserva la píldora blanca de siempre', async ({ page }) => {
    // La regresión cara: estos temas no deben cambiarle la barra a nadie más.
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });
    const activa = page.getByRole('navigation', { name: 'Secciones' }).locator('a').first();
    const css = await activa.evaluate((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, sombra: s.boxShadow };
    });
    expect(css.bg).toBe('rgb(255, 255, 255)');
    expect(css.sombra).not.toBe('none');
  });
});
