import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// El cuadro del pase de acceso, en «Tu reserva».
//
// ⚠️ Sin QR todavía (el pase se activa un rato antes de la clase), el cuadro se
// pintaba igual que con él: 168 px de BLANCO MACIZO con una frase dentro. Es la
// cara exacta de una imagen que no ha cargado, y se ve justo donde más duele —
// en la puerta del estudio, con el móvil en la mano.
//
// Sin QR ahora es un HUECO: mismo tamaño, sin relleno, borde discontinuo. Con
// QR se queda blanco, porque la cámara necesita ese contraste para leerlo — esa
// mitad del test es la que impide «arreglar» el hueco quitándole el blanco
// también al QR.

const base = `/portal/${SLUG}`;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

test.describe('Student PWA · el pase sin QR no parece un QR roto', () => {
  test.describe.configure({ timeout: 120_000 });

  test('antes de activarse, el cuadro es un hueco: sin relleno y con borde discontinuo', async ({ page }) => {
    // `reservada` deja el pase de `res-1` con `vigente: false` y sin token.
    await sembrarSociaCompleta(page, { bono: 5, reservada: true });
    await page.goto(`${base}/mis-reservas/res-1`);

    const hueco = page.getByTestId('pase-hueco');
    await expect(hueco).toBeVisible({ timeout: 30_000 });
    await expect(hueco).toContainText('Tu pase se activa');
    // Se mide lo PINTADO, no la clase ni el estilo declarado.
    await expect(hueco).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(hueco).toHaveCSS('border-top-style', 'dashed');
    await expect(page.getByTestId('pase-qr')).toHaveCount(0);

    // ⚠️ Y que la frase de dentro SE LEA. La primera versión de este arreglo
    // le quitó el blanco al hueco y dejó el texto en el gris oscuro pensado
    // para ese blanco: sobre la tarjeta oscura, ~2:1. Este test pasaba igual
    // —medía fondo y borde— y lo cazó la captura. Se mide el contraste REAL
    // del texto contra la tarjeta: aquí el fondo es un color liso, no una
    // foto, así que los colores calculados son fiables, y el umbral vale para
    // la marca de cualquier estudio.
    const ratio = await hueco.evaluate((el) => {
      const texto = el.querySelector('p');
      const tarjeta = el.closest('section');
      if (!texto || !tarjeta) return 0;
      const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(rgb(getComputedStyle(texto).color));
      const b = lum(rgb(getComputedStyle(tarjeta).backgroundColor));
      const [alto, bajo] = a > b ? [a, b] : [b, a];
      return (alto + 0.05) / (bajo + 0.05);
    });
    // 12,5 px en negrita no llega a «texto grande» (≥18,66 px): 4,5:1.
    expect(+ratio.toFixed(2), 'la frase del hueco no se lee sobre la tarjeta').toBeGreaterThanOrEqual(4.5);
  });

  test('con el pase activo, el QR sigue sobre blanco: la cámara necesita ese contraste', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 5, reservada: true });
    // Registrada DESPUÉS del andamiaje: en Playwright gana la última ruta.
    await page.route((u) => u.pathname === '/api/public/pase', (r) => r.fulfill(json({
      hayPase: true, reservaId: 'res-1', vigente: true, yaAsistida: false,
      minutosParaActivarse: 0,
      seActivaA: '2026-08-12T09:00:00.000Z', paseHasta: '2026-08-12T10:15:00.000Z',
      inicio: '2026-08-12T10:00:00', token: 'e2e-token-firmado', codigo: 'K7Q2',
    })));
    await page.goto(`${base}/mis-reservas/res-1`);

    const qr = page.getByTestId('pase-qr');
    await expect(qr).toBeVisible({ timeout: 30_000 });
    await expect(qr.getByRole('img', { name: 'Código QR de acceso' })).toBeVisible();
    await expect(qr).toHaveCSS('background-color', 'rgb(250, 249, 245)');
    await expect(page.getByTestId('pase-hueco')).toHaveCount(0);
  });
});
