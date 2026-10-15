import { test, expect } from '@playwright/test';
import { enOscuro, ir } from './panel-sembrado';
import { alTrimestrePasado, alTrimestrePasadoDesdeAviso, bloque, preparar } from './informes-euro-plaza-datos';

// ─────────────────────────────────────────────────────────────────────────────
// Informes: el mapa de «€ por plaza a la venta» (pieza E).
//
// Entra APAGADO (interruptor `INFORMES_EURO_PLAZA`, leído en el servidor). Aquí:
//   - apagado, o con el servidor fallando, Informes es la de siempre, y lo ha
//     preguntado (contador de peticiones: «no se ve» podría ser «no preguntó»);
//   - con el mes en curso no pinta cifras (el reparto necesita el periodo
//     cerrado) y ofrece el trimestre pasado;
//   - con el trimestre pasado, las cifras salen del cálculo real, cuadran con el
//     «Cobrado» del titular y cada casilla enseña su cálculo;
//   - con los recibos a medias no pinta ni un euro;
//   - el explicador: teclado, foco y «visto» por persona.
// Los datos van en el trimestre ANTERIOR al de hoy, para que valga cualquier día.
// ─────────────────────────────────────────────────────────────────────────────


test.describe('Informes: € por plaza a la venta (pieza E)', () => {
  test.describe.configure({ timeout: 120_000 });

  /** Tras contestar el interruptor, el tiempo de que el bloque llegara si estuviera encendido. */
  async function daTiempoAlBloque(page: import('@playwright/test').Page) {
    await expect(page.getByTestId('informe-tabla-clases').or(page.getByText('No hay clases ya empezadas en este periodo.'))).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 1_500)));
  }

  test('apagado: Informes es la de siempre, y lo ha preguntado', async ({ page }) => {
    const peticiones = await preparar(page, { euroPlaza: { status: 200, body: { disponible: false } } });
    await ir(page, 'informes');
    await expect(page.getByTestId('informe-cobrado')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => peticiones.euroPlaza).toBeGreaterThan(0);
    await daTiempoAlBloque(page);
    await expect(bloque(page)).toHaveCount(0);
  });

  for (const [caso, opciones] of [
    ['un 500', { status: 500, body: { error: 'x' } }],
    ['un 401', { status: 401, body: { error: 'No autorizado' } }],
  ] as const) {
    test(`con ${caso} del interruptor, apagado`, async ({ page }) => {
      const peticiones = await preparar(page, { euroPlaza: opciones });
      const contestado = page.waitForResponse(r => r.url().includes('/api/informes/euro-plaza'));
      await ir(page, 'informes');
      await contestado;
      expect(peticiones.euroPlaza).toBeGreaterThan(0);
      await daTiempoAlBloque(page);
      await expect(bloque(page)).toHaveCount(0);
    });
  }

  test('con la red caída al preguntar, apagado', async ({ page }) => {
    await preparar(page);
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/informes/euro-plaza', (route) => { intentos++; return route.abort('failed'); });
    const fallo = page.waitForEvent('requestfailed', r => r.url().includes('/api/informes/euro-plaza'));
    await ir(page, 'informes');
    await fallo;
    expect(intentos).toBeGreaterThan(0);
    await daTiempoAlBloque(page);
    await expect(bloque(page)).toHaveCount(0);
  });

  test('el mes en curso no pinta cifras y ofrece el trimestre pasado', async ({ page }) => {
    await preparar(page);
    await ir(page, 'informes');
    await expect(bloque(page)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('euro-plaza-aviso')).toContainText('Este mapa se calcula con periodos ya terminados');
    await expect(bloque(page).getByTestId('euro-plaza-mapa')).toHaveCount(0);
    await expect(bloque(page).getByTestId('euro-plaza-aviso')).not.toContainText('€');
    await expect(page.getByTestId('explicador-primera-vez'), 'sin nada que mirar, sin tarjeta').toHaveCount(0);
    // «Ver el mes pasado» también lleva a un periodo cerrado; el foco va al título del bloque.
    await bloque(page).getByRole('button', { name: 'Ver el mes pasado' }).click();
    await expect(page.getByTestId('euro-plaza-aviso')).toHaveCount(0);
    await expect(page.locator('#informe-euro-plaza')).toBeFocused();
  });

  test('con la semana elegida no pinta cifras y lleva al trimestre pasado', async ({ page }) => {
    await preparar(page);
    await ir(page, 'informes');
    await expect(bloque(page)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Semana', exact: true }).click();
    await expect(page.getByTestId('euro-plaza-aviso')).toContainText('Con una semana ninguna hora llega a 4 clases');
    await bloque(page).getByRole('button', { name: 'Ver el trimestre pasado' }).click();
    await expect(page.getByTestId('euro-plaza-mapa')).toBeVisible();
  });

  test('el trimestre pasado: cifras del cálculo real, «—» con pocas clases y cuadre con el titular', async ({ page }) => {
    await preparar(page);
    await ir(page, 'informes');
    await alTrimestrePasado(page);

    // Martes 18:00: (15 + 20 + 10) × 4 = 180 € entre 24 plazas = 7,50 €.
    const martes = page.locator('[data-celda="2-18:00"]');
    await expect(martes).toContainText('7,50 €');
    // Jueves 10:00: 3 clases, solo ClassPass: «—».
    const jueves = page.locator('[data-celda="4-10:00"]');
    await expect(jueves).toContainText('—');
    await expect(jueves).toHaveAttribute('aria-label', /solo 3 clases/);

    // Total: 180 € entre 42 plazas = 4,29 €.
    await expect(page.getByTestId('euro-plaza-total')).toContainText('4,29 €');

    // El cuadre empieza por el mismo «Cobrado» del titular (230 €) y quita la Caja (50 €).
    await bloque(page).getByText('Ver cálculo', { exact: true }).click();
    const cuadre = page.getByTestId('euro-plaza-cuadre');
    const titular = (await page.getByTestId('informe-cobrado').innerText()).match(/[\d.]+,\d{2} €/)?.[0];
    expect(titular).toBe('230,00 €');
    await expect(cuadre.locator('tr').first()).toContainText(titular!);
    await expect(cuadre).toContainText('50,00 €');
    await expect(cuadre).toContainText('180,00 €');

    // La casilla abre su cálculo, con un ejemplo de alumna real.
    await martes.click();
    await expect(martes).toHaveAttribute('aria-expanded', 'true');
    const detalle = page.getByTestId('euro-plaza-detalle');
    await expect(detalle).toContainText('Plazas a la venta');
    await expect(detalle).toContainText('24');
    await expect(detalle).toContainText('Por ejemplo, Ana: pagó 60,00 € en el periodo y ocupó 4 plazas');
  });

  test('con los recibos a medias no pinta ni un euro', async ({ page }) => {
    const peticiones = await preparar(page, { recibos500: true });
    await ir(page, 'informes');
    await expect(bloque(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => peticiones.recibos).toBeGreaterThan(0);
    await expect(page.getByTestId('euro-plaza-aviso')).toContainText('Con datos a medias no se calcula');
    await expect(bloque(page).getByTestId('euro-plaza-mapa')).toHaveCount(0);
  });

  test('sin la tabla de planes no pinta un mapa a 0 €: dice que faltan datos', async ({ page }) => {
    await preparar(page);
    let intentos = 0;
    await page.route('**/rest/v1/planes_tarifa**', (route) => { intentos++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
    await ir(page, 'informes');
    await alTrimestrePasadoDesdeAviso(page);
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByTestId('euro-plaza-aviso')).toContainText('Con datos a medias no se calcula');
    await expect(bloque(page).getByTestId('euro-plaza-mapa')).toHaveCount(0);
  });

  test('el explicador: se abre desde el enlace, ← → y Esc, el foco vuelve, y «visto» se recuerda', async ({ page }) => {
    await preparar(page);
    await ir(page, 'informes');
    await alTrimestrePasado(page);
    await expect(page.getByTestId('explicador-primera-vez')).toBeVisible();

    const enlace = bloque(page).getByRole('button', { name: '¿Qué es el € por plaza?' });
    await enlace.click();
    const dialogo = page.getByTestId('explicador');
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Paso 1 de 5');
    await page.keyboard.press('ArrowRight');
    await expect(dialogo).toContainText('Paso 2 de 5');
    await page.keyboard.press('ArrowLeft');
    await expect(dialogo).toContainText('Paso 1 de 5');
    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
    await expect(enlace).toBeFocused();

    // Saltado cuenta como visto: la tarjeta de primera vez no vuelve, el enlace sí.
    await expect(page.getByTestId('explicador-primera-vez')).toHaveCount(0);
    await page.reload();
    await alTrimestrePasado(page);
    await expect(page.getByTestId('euro-plaza-mapa')).toBeVisible();
    await expect(page.getByTestId('explicador-primera-vez'), 'visto: no vuelve tras recargar').toHaveCount(0);
    await expect(bloque(page).getByRole('button', { name: '¿Qué es el € por plaza?' })).toBeVisible();
  });

  test('el explicador hasta el final: recetas y «Entendido»', async ({ page }) => {
    await preparar(page);
    await ir(page, 'informes');
    await alTrimestrePasado(page);
    await page.getByTestId('explicador-primera-vez').getByRole('button', { name: 'Ver cómo' }).click();
    const dialogo = page.getByTestId('explicador');
    for (let i = 0; i < 4; i++) await dialogo.getByRole('button', { name: 'Siguiente' }).click();
    await expect(dialogo.getByTestId('explicador-recetas')).toContainText('ClassPass, Wellhub o USC = 0 €');
    await dialogo.getByRole('button', { name: 'Entendido' }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByTestId('explicador-primera-vez')).toHaveCount(0);
    // La tarjeta ya no está: el foco vuelve al enlace, no se pierde.
    await expect(bloque(page).getByRole('button', { name: '¿Qué es el € por plaza?' })).toBeFocused();
  });

  for (const oscuro of [false, true]) {
    test(`con un horario de verdad, tres tonos y el texto de cada uno se lee (AA)${oscuro ? ', en oscuro' : ''}`, async ({ page }) => {
      if (oscuro) await enOscuro(page);
      await preparar(page, { horarioCompleto: true });
      await ir(page, 'informes');
      await alTrimestrePasado(page);
      // Fondo y texto de cada casilla con cifra, resueltos a sRGB en un canvas
      // (el fondo es un color-mix y getComputedStyle no lo da en rgb).
      const medidas = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        // El color encima de su fondo (un texto con alfa se compone sobre él).
        const rgb = (color: string, sobre = '#fff') => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = sobre; ctx.fillRect(0, 0, 1, 1);
          ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
        };
        const lum = ([r, g, b]: number[]) => [r, g, b].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
        const contraste = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
        return Array.from(document.querySelectorAll<HTMLElement>('[data-celda]')).flatMap(b => {
          const [cifra, linea] = Array.from(b.querySelectorAll<HTMLElement>(':scope > span'));
          if (!cifra || !b.style.backgroundColor) return [];
          const fondoCss = getComputedStyle(b).backgroundColor;
          const fondo = rgb(fondoCss);
          const texto = (el: HTMLElement) => contraste(rgb(getComputedStyle(el).color, `rgb(${fondo.join(',')})`), fondo);
          return [{ fondo: fondo.join(','), contraste: Math.min(texto(cifra), linea ? texto(linea) : Infinity) }];
        });
      });
      expect(new Set(medidas.map(m => m.fondo)).size).toBe(3);
      for (const m of medidas) expect(m.contraste, `fondo ${m.fondo}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('móvil: la rejilla hace su propio scroll, la página no se desborda y una casilla abre su cálculo a la vista', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparar(page, { horarioCompleto: true });
    await ir(page, 'informes');
    await alTrimestrePasado(page);
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda).toBe(false);
    const celda = page.locator('[data-celda="1-09:00"]');
    await celda.click();
    await expect(page.getByTestId('euro-plaza-detalle')).toBeInViewport();
    await page.getByTestId('euro-plaza-detalle').getByRole('button', { name: 'Cerrar' }).click();
    await expect(celda).toBeFocused();
  });
});
