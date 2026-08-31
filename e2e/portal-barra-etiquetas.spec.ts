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

// Las pestañas REALES del portal (lib/portal-nav.ts, reconstrucción "Tentare
// Studio App" 2026-08): Clases+Bonos se fusionaron en "Reservas", "Inicio" se
// renombró a "Hoy" y "Explorar" es pestaña nueva (etiqueta verificada contra
// el mockup real: el seg interno sigue siendo `buscar`, solo cambia el texto).
const NOMBRES = ['Hoy', 'Explorar', 'Reservas', 'Perfil'];

test.describe('Barra inferior — etiquetas por variante', () => {
  test('sin variante: solo la activa lleva texto, y es más ancha para hacerle sitio', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    await expect(nav.getByText('Hoy', { exact: true })).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    for (const n of NOMBRES) {
      await expect(nav.getByText(n, { exact: true })).toBeVisible();
    }
    // Con las cuatro etiquetadas, ensanchar la activa dejaría a las otras
    // apretadas y sin motivo: reparto a partes iguales.
    // "Buscar" se pinta como <button>, no <a> (no es una ruta real — abre un
    // overlay), así que hace falta el selector combinado para no perderla.
    const cajas = await nav.locator('a, button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of cajas) expect(Math.abs(w - cajas[0])).toBeLessThan(1.5);
  });

  test('`todasRelleno` (Oliva): además, el icono activo va macizo', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { barra: 'todasRelleno' } });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

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
    await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const rellenos = await nav.locator('svg').evaluateAll((els) =>
      els.map((e) => getComputedStyle(e).fill));
    for (const f of rellenos) expect(f).toBe('none');
  });
});

// ⚠️ RETIRADO (decisión del fundador, 2026-08-27): aquí vivía "Barra inferior
// — el estilo real de cada tema", que montaba Oliva/Bloom/Noir de verdad
// (`montarPortal({ tema: ... })`) y comprobaba el CSS calculado de cada uno.
// Esos tres temas (y Tentada/Sereno) se borraron enteros del registro de
// temas en el PR 2 de "borrar temas del kit" (`lib/theme-definitions.ts`
// quedó solo con `classic`) — `getThemeDefinition('oliva'|'bloom'|'noir')`
// ya devuelve `undefined`, así que este bloque ya no tiene ningún tema real
// que montar. La única aserción que seguía siendo de "de siempre" — que un
// estudio SIN tema de esta tanda conserva la píldora blanca de fábrica — ya
// está cubierta arriba por el describe "Barra inferior — etiquetas por
// variante" (que no monta ningún tema, solo variantes).
