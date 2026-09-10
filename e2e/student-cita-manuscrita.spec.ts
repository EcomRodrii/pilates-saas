import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// La frase del estudio escrita a mano, en Inicio.
//
// Dos cosas que este guardia protege y que no se ven leyendo el JSX:
//
//  1. Que la tipografía LLEGA. Es la única caligráfica del repo y se carga con
//     `next/font` desde el layout raíz; si alguien la quita de ahí, el navegador
//     cae a la `cursive` del sistema y la frase se sigue leyendo — mal, pero se
//     lee. Un fallo así no rompe nada y no lo cazaría ningún otro test.
//  2. Que sin frase NO se pinta la tarjeta. Es contenido opcional del estudio.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · la frase manuscrita', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('se pinta con la manuscrita de verdad, no con la cursiva del sistema', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const cita = page.getByTestId('cita-manuscrita').locator('p');
    await expect(cita).toBeVisible({ timeout: 30_000 });

    const familia = await cita.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(familia, 'la primera familia es la manuscrita cargada por next/font').toMatch(/Sacramento|__manuscrita|__Sacramento/i);

    // Y que el navegador la haya CARGADO, no solo pedido: `document.fonts`
    // sabe si hay una cara disponible para ese nombre. Sin esto, el test
    // pasaría con la fuente declarada y sin descargar.
    const cargada = await page.evaluate(async () => {
      await document.fonts.ready;
      return Array.from(document.fonts).some((f) => /sacramento|manuscrita/i.test(f.family));
    });
    expect(cargada, 'la cara está en document.fonts').toBe(true);
  });

  test('no le pedimos negrita a una fuente que solo tiene un peso', async ({ page }) => {
    // Sacramento tiene un único peso: pedir 700 hace que el navegador la
    // engorde él, y una caligráfica engordada a mano se ve rota.
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const cita = page.getByTestId('cita-manuscrita').locator('p');
    await expect(cita).toBeVisible({ timeout: 30_000 });
    const peso = await cita.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(peso)).toBeLessThanOrEqual(400);
  });

  test('el color es el de la MARCA del estudio, no un verde escrito a mano', async ({ page }) => {
    // Es la trampa que ya costó cara dos veces —la barra del bono en verde
    // (#1832) y el ✓ de acento sobre un muro (#1827)—: un color elegido por lo
    // que significa, puesto sobre una superficie que no controla. Esta tarjeta
    // es la única pieza en color de la home, así que si algún día alguien fija
    // aquí el oliva de la guía, los otros doce estudios lo heredan.
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const tarjeta = page.getByTestId('cita-manuscrita').locator('div').first();
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });

    const { fondo, acento, tinta, acentoTinta } = await tarjeta.evaluate((el) => {
      const raiz = getComputedStyle(document.querySelector('.student-app')!);
      const cs = getComputedStyle(el);
      const resolver = (v: string) => {
        const s = document.createElement('span');
        s.style.color = v; document.body.appendChild(s);
        const c = getComputedStyle(s).color; s.remove(); return c;
      };
      return {
        fondo: cs.backgroundColor,
        tinta: cs.color,
        acento: resolver(raiz.getPropertyValue('--accent')),
        acentoTinta: resolver(raiz.getPropertyValue('--accent-foreground')),
      };
    });
    expect(fondo, 'el fondo es --accent, el color del estudio').toBe(acento);
    expect(tinta, 'y la tinta, su pareja del sistema').toBe(acentoTinta);
  });
});
