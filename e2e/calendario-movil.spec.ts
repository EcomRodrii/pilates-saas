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
    await expect(page.getByTestId('semana-franjas')).toHaveCount(0);
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

  test('el día también es una lista, con la semana en una tira, y elegir fecha cabe en la pantalla', async ({ page }) => {
    await calendario(page);
    await page.getByRole('button', { name: /^Día$/ }).tap();
    await expect(page.locator('[data-agenda="dia"]')).toBeVisible();
    await expect(page.getByTestId('grid-dia-scroll')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Días de la semana' })).toBeVisible();
    expect(await desborde(page)).toBeLessThanOrEqual(0);

    // El mes ya no es una vista: es la fecha, que se toca para elegir otro día.
    await page.getByTestId('selector-fecha').tap();
    const panel = page.getByRole('dialog', { name: 'Elegir día' });
    await expect(panel).toBeVisible();
    const caja = (await panel.boundingBox())!;
    const ancho = page.viewportSize()!.width;
    expect(caja.x, 'el selector de fecha se sale por la izquierda').toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width, 'el selector de fecha se sale por la derecha').toBeLessThanOrEqual(ancho + 0.5);
    expect(await desborde(page)).toBeLessThanOrEqual(0);
  });

  test('los controles de la cabecera se tocan con el dedo', async ({ page }) => {
    await calendario(page);
    const pequenos: string[] = [];
    const controles = [
      ...[/^Día$/, /^Semana$/, /^Horario$/, /^Crear clase$/, /^Buscar clase$/, /^Filtrar/].map(nombre => page.getByRole('button', { name: nombre })),
      page.getByTestId('selector-fecha'),
    ];
    for (const control of controles) {
      const caja = await control.boundingBox();
      if (!caja || caja.height < 44 || caja.width < 44) pequenos.push(`${control} ${caja?.width}×${caja?.height}`);
    }
    expect(pequenos).toEqual([]);
  });

  // La auditoría lo midió: la cabecera vieja empujaba la lista a media pantalla
  // (~460 px en móvil), y la primera versión de la nueva aún más (~505, seis
  // filas). En tres filas, como la maqueta, la primera clase asoma arriba.
  test('la cabecera cabe en tres filas: la lista empieza justo debajo', async ({ page }) => {
    await calendario(page);
    await page.getByRole('button', { name: /^Día$/ }).tap();
    await expect(page.locator('[data-agenda="dia"]')).toBeVisible();
    // Se mide desde el título y no desde arriba: encima puede estar el aviso de
    // «¿Primera vez aquí?», que se cierra y no es de la cabecera.
    const titulo = (await page.getByRole('heading', { name: 'Calendario' }).boundingBox())!;
    const primera = (await clases(page).first().boundingBox())!;
    // Tres filas, la tira de días y las cifras: ~250 px. Con las seis filas de
    // antes eran ~400.
    expect(primera.y - titulo.y, 'entre el título y la primera clase hay demasiada cabecera').toBeLessThan(300);
    // «Crear clase» va a la altura del título, no en una fila propia.
    const crear = (await page.getByRole('button', { name: /^Crear clase$/ }).boundingBox())!;
    expect(Math.abs((crear.y + crear.height / 2) - (titulo.y + titulo.height / 2)), '«Crear clase» no está en la fila del título').toBeLessThan(12);
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
    await expect(page.getByTestId('semana-franjas')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-agenda]')).toHaveCount(0);
  });
});
