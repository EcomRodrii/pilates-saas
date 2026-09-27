import { test, expect, type Request } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, QR_ACCESO_E2E } from './socia-completa';

// El QR de acceso de la alumna: Perfil → QR de acceso, y el mismo QR en el
// detalle de su reserva. Permanente: sustituyó al pase de 2 minutos (27-sep).
//
// ⚠️ Los caminos de fallo llevan contador de peticiones: «no enseñó el QR»
// puede ser verdad por no haberlo pedido nunca (ver `.claude/tentare-os.md`).

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const esQr = (u: URL) => u.pathname === '/api/public/qr-acceso';

test.describe('Student PWA · QR de acceso', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Perfil lo enseña arriba con la miniatura real, y su pantalla lo enseña grande y explica para qué sirve', async ({ page }) => {
    const { sinMockear } = await sembrarSociaCompleta(page, { bono: 5 });
    await page.goto(`${base}/perfil`);

    const fila = page.getByTestId('perfil-qr-acceso');
    await expect(fila).toBeVisible({ timeout: 30_000 });
    await expect(fila).toContainText('QR de acceso');
    await expect(fila.getByTestId('qr-acceso')).toBeVisible();

    await fila.click();
    await expect(page).toHaveURL(new RegExp(`${base}/perfil/qr$`));
    const qr = page.getByTestId('qr-acceso');
    await expect(qr.getByRole('img', { name: 'Tu código QR de acceso' })).toBeVisible({ timeout: 30_000 });
    // La cámara lee contraste: el QR va sobre blanco macizo.
    await expect(qr).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByText('¿Para qué sirve este QR?')).toBeVisible();
    await expect(page.getByText('Tu QR permite al estudio comprobar rápidamente si tienes una clase reservada')).toBeVisible();
    expect(sinMockear()).toEqual([]);
  });

  test('el detalle de una reserva enseña el MISMO QR, sin pedir el pase de 2 minutos', async ({ page }) => {
    const pedidosPase: Request[] = [];
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/public/pase') pedidosPase.push(r); });
    const cuerpos: string[] = [];
    await sembrarSociaCompleta(page, { bono: 5, reservada: true });
    page.on('request', r => { if (esQr(new URL(r.url()))) cuerpos.push(r.postData() ?? ''); });
    await page.goto(`${base}/mis-reservas/res-1`);

    const qr = page.getByTestId('qr-acceso');
    await expect(qr).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Muéstralo al llegar al estudio')).toBeVisible();
    expect(cuerpos.length).toBeGreaterThan(0);
    expect(JSON.parse(cuerpos[0])).toMatchObject({ slug: SLUG, regenerar: false });
    expect(pedidosPase).toHaveLength(0);
  });

  test('si el servidor falla, un hueco que se lee y se puede reintentar (y se reintentó de verdad)', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 5 });
    let intentos = 0;
    // Registrada DESPUÉS del andamiaje: en Playwright gana la última ruta.
    await page.route(esQr, r => { intentos++; return r.fulfill(intentos === 1 ? json({ error: 'caído' }, 500) : json({ activo: true, qr: QR_ACCESO_E2E, creadoEn: '2026-08-01T10:00:00.000Z' })); });
    await page.goto(`${base}/perfil/qr`);

    const hueco = page.getByTestId('qr-acceso-hueco');
    await expect(hueco).toContainText('No hemos podido cargar tu QR', { timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    // Un hueco, no un QR roto: sin blanco y con borde discontinuo.
    await expect(hueco).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(hueco).toHaveCSS('border-top-style', 'dashed');
    // Y la frase se lee sobre la tarjeta oscura (4,5:1).
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
    expect(+ratio.toFixed(2)).toBeGreaterThanOrEqual(4.5);

    await hueco.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('qr-acceso')).toBeVisible({ timeout: 15_000 });
    expect(intentos).toBe(2);
  });

  test('generar uno nuevo: si el servidor dice que no, no se anuncia; si dice que sí, se dice que el anterior ya no vale', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 5 });
    const regenerar: string[] = [];
    await page.route(esQr, r => {
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as { regenerar?: boolean };
      if (!cuerpo.regenerar) return r.fulfill(json({ activo: true, qr: QR_ACCESO_E2E, creadoEn: '2026-08-01T10:00:00.000Z' }));
      regenerar.push('x');
      return r.fulfill(regenerar.length === 1
        ? json({ error: 'Demasiadas peticiones' }, 429)
        : json({ activo: true, qr: 'TNT1-otroQrDeAccesoNuevo0001', creadoEn: '2026-09-27T10:00:00.000Z' }));
    });
    await page.goto(`${base}/perfil/qr`);
    await expect(page.getByTestId('qr-acceso')).toBeVisible({ timeout: 30_000 });

    const pedir = async () => {
      await page.getByRole('button', { name: 'Generar un QR nuevo' }).click();
      await page.getByRole('button', { name: 'Generar QR nuevo' }).click();
    };
    await pedir();
    await expect(page.getByRole('status').filter({ hasText: 'No hemos podido cambiarlo' })).toBeVisible({ timeout: 15_000 });
    expect(regenerar.length).toBeGreaterThan(0);
    await expect(page.getByText('El anterior ya no funciona')).toHaveCount(0);
    // El QR de antes sigue en pantalla: un fallo al cambiarlo no deja un hueco.
    await expect(page.getByTestId('qr-acceso')).toBeVisible();

    await pedir();
    await expect(page.getByText('Listo: este es tu QR nuevo. El anterior ya no funciona.')).toBeVisible({ timeout: 15_000 });
    expect(regenerar).toHaveLength(2);
  });
});
