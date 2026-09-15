import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario se lee en un móvil sin hacer zoom.
//
// «Se ve muy muy pequeño», dijo el fundador, que quiere mirarlo desde casa en el
// teléfono. Medido a 375×812 antes del arreglo: la rejilla de horas quedaba en
// una tira al fondo de la pantalla, con las clases a 9,5 px y siete columnas de
// 92 px desplazándose de lado; el mes amontonaba «1 clase» encima del día de la
// fila siguiente. Por debajo de 768 px Día y Semana son ahora una lista por
// hora, y esto lo MIDE: tamaño de letra, alto que se toca, que nada se salga de
// lado y que el texto no salga cortado. Que el texto esté en el DOM no prueba
// nada: ya lo estaba cuando no se leía.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 180_000 });

const MOVIL = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const clases = (page: Page) => page.locator('[data-agenda-clase]');
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function calendario(page: Page) {
  await montar(page);
  await ir(page, 'calendario');
  await expect(clases(page).first()).toBeVisible({ timeout: 60_000 });
}

/** Texto pintado dentro de la lista por debajo de 14 px, o cortado con «…». */
const letraDeLaLista = (page: Page) => page.evaluate(() => {
  const raiz = document.querySelector('[data-agenda]');
  if (!raiz) return { pequenos: ['no hay lista'], cortados: [] as string[] };
  const pequenos: string[] = [];
  const cortados: string[] = [];
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const texto = n.textContent?.trim();
    const el = n.parentElement;
    if (!texto || !el || el.getBoundingClientRect().width === 0) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 14) pequenos.push(`«${texto}» a ${px} px`);
    if (el.scrollWidth > el.clientWidth + 1) cortados.push(`«${texto}»`);
  }
  return { pequenos, cortados };
});

test.describe('Calendario en un móvil de 375×812', () => {
  test.use(MOVIL);

  test('la semana es una lista que se lee: hora, clase, sala e instructora, sin nada de lado', async ({ page }) => {
    await calendario(page);
    await expect(page.getByTestId('grid-semana-scroll')).toHaveCount(0);
    expect(await desborde(page), 'la página se sale de lado').toBeLessThanOrEqual(0);

    const { pequenos, cortados } = await letraDeLaLista(page);
    expect(pequenos, `\n${pequenos.join('\n')}\n`).toEqual([]);
    expect(cortados, `\n${cortados.join('\n')}\n`).toEqual([]);

    const n = await clases(page).count();
    expect(n).toBeGreaterThan(0);
    for (const clase of await clases(page).all()) {
      const boton = clase.getByRole('button').first();
      const caja = (await boton.boundingBox())!;
      expect(caja.height, 'una clase se toca entera').toBeGreaterThanOrEqual(44);
      expect(caja.width, 'una clase ocupa el ancho').toBeGreaterThan(300);
      await expect(boton).toContainText(/\d{2}:\d{2}/);
      await expect(boton).toContainText(/Reformer|Mat/);
      await expect(boton).toContainText(/Sala (Reformer|Mat)/);
      await expect(boton).toContainText(/Cloe|Marta Ruiz/);
    }

    // Cada día, por hora.
    const desordenados = await page.evaluate(() => [...document.querySelectorAll('[data-agenda-dia]')].flatMap((dia) => {
      const horas = [...dia.querySelectorAll('[data-agenda-clase]')].map((c) => c.textContent?.match(/\d{2}:\d{2}/)?.[0] ?? '');
      return horas.join() === [...horas].sort().join() ? [] : [`${dia.getAttribute('data-agenda-dia')}: ${horas.join(', ')}`];
    }));
    expect(desordenados).toEqual([]);
  });

  test('tocar una clase abre su ficha', async ({ page }) => {
    await calendario(page);
    await clases(page).first().getByRole('button').first().tap();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('la última clase de la semana se alcanza bajando la página', async ({ page }) => {
    await calendario(page);
    const ultima = clases(page).last();
    await ultima.scrollIntoViewIfNeeded();
    await expect(ultima).toBeInViewport({ ratio: 1 });
  });

  test('el día también es una lista, y el mes no amontona los días', async ({ page }) => {
    await calendario(page);
    await page.getByRole('button', { name: /^Día$/ }).tap();
    await expect(page.locator('[data-agenda="dia"]')).toBeVisible();
    await expect(page.getByTestId('grid-dia-scroll')).toHaveCount(0);
    expect(await desborde(page)).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: /^Mes$/ }).tap();
    await page.waitForTimeout(500);
    const amontonados = await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label*=" de 20"]')].flatMap((celda) => {
      const r = celda.getBoundingClientRect();
      return [...celda.querySelectorAll('span')].some((s) => s.getBoundingClientRect().bottom > r.bottom + 1) ? [celda.getAttribute('aria-label')] : [];
    }));
    expect(amontonados, 'celdas del mes con el contenido fuera de su caja').toEqual([]);
    expect(await desborde(page)).toBeLessThanOrEqual(0);
  });

  test('los controles de la cabecera se tocan con el dedo', async ({ page }) => {
    await calendario(page);
    const pequenos: string[] = [];
    for (const nombre of [/^Día$/, /^Semana$/, /^Mes$/, /^Horario$/, /^Semana anterior$/, /^Hoy$/, /^Semana siguiente$/]) {
      const caja = await page.getByRole('button', { name: nombre }).boundingBox();
      if (!caja || caja.height < 44) pequenos.push(`${nombre} ${caja?.height}`);
    }
    expect(pequenos).toEqual([]);
  });

  test('marcando varias, la barra de abajo se ve aunque la página esté bajada', async ({ page }) => {
    await calendario(page);
    await page.getByTitle('Marcar varias clases para cambiarles la instructora de una vez').tap();
    const ultima = clases(page).last().getByRole('button').first();
    await ultima.scrollIntoViewIfNeeded();
    await ultima.tap();
    await expect(ultima).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 clase marcada')).toBeInViewport({ ratio: 1 });
  });
});

test.describe('En un iPad de 768×1024 sigue la rejilla', () => {
  test.use({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true });

  test('semana en rejilla, sin lista', async ({ page }) => {
    await montar(page);
    await ir(page, 'calendario');
    await expect(page.getByTestId('grid-semana-scroll')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-agenda]')).toHaveCount(0);
  });
});
