import { test, expect, type Page } from '@playwright/test';
import { SLUG, SESION_ID, sembrarSociaCompleta, type OpcionesSocia } from './socia-completa';

// La ficha de una clase (P10 + P02, 5-oct-2026): la foto entera y el título DEBAJO, «Cómo vienes» con sus datos, las
// filas con icono, «Cómo llegar» y «Escribe al estudio». Todo afirmado dentro de su testid o `data-fila`: la fila corta
// y la tarjeta pueden repetir «Incluida en tu cuota».
//
// Horas con zona explícita (+02:00) y el reloj en hora de Madrid: el test dice lo mismo con TZ=UTC (el CI).

const base = `/portal/${SLUG}`;
const MOVIL = { width: 390, height: 844 };

/** La clase del fixture: 10:00–10:50 de Madrid del 12-ago-2026, con su zona. */
function conZona(f: Record<string, unknown>) {
  const [s] = f.sesiones as Record<string, unknown>[];
  s.inicio = '2026-08-12T10:00:00+02:00';
  s.fin = '2026-08-12T10:50:00+02:00';
}

async function abrir(page: Page, o: OpcionesSocia = {}) {
  const a = await sembrarSociaCompleta(page, { relojMadrid: true, ...o, ajustar: (f) => { conZona(f); o.ajustar?.(f); } });
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Reformer' })).toBeVisible({ timeout: 45_000 });
  return a;
}

/**
 * La lista CERRADA de lo que puede pedir la ficha (medida en esta rama): el payload, la sesión, la campana, el interruptor
 * «Clase fija» y el aforo ligero (este depende del reloj: no se pide si el payload tiene menos de 5 s). «Cómo vienes»,
 * compartir y las filas salen del payload en caché: una petición nueva tiene que venir con su motivo y cambiar esta lista.
 */
const RUTAS_DE_LA_FICHA = new Set([
  '/api/notifications', '/api/public/aforo', '/api/public/clases-fijas', '/api/public/session', '/api/public/studio-data',
]);

test.describe('Student PWA · ficha de una clase', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: MOVIL });

  test('con bono: la foto sola arriba, el título debajo, «Cómo vienes» con su saldo y las cinco filas', async ({ page }) => {
    const a = await abrir(page, { reglasCreditos: [{ trigger: 'ASISTENCIA_CLASE', creditos: 10 }] });
    const heroe = await page.getByTestId('ficha-heroe').boundingBox();
    const titulo = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(heroe!.y + heroe!.height, 'el título tiene que ir DEBAJO de la foto').toBeLessThanOrEqual(titulo!.y + 1);

    const cv = page.getByTestId('como-vienes');
    await expect(cv).toContainText('Bono 8 sesiones');
    await expect(cv).toContainText('Te quedan 5');
    // En la primera pantalla, sin hacer scroll.
    const caja = await cv.boundingBox();
    expect(caja!.y, '«Cómo vienes» empieza fuera de la primera pantalla').toBeLessThan(MOVIL.height);
    await expect(cv.getByRole('link', { name: /Ver/ })).toHaveAttribute('href', `${base}/bonos/sus-1`);

    await expect(page.locator('[data-fila="cuando"]')).toHaveText('Hoy · 10:00 – 10:50 · 50 min');
    await expect(page.locator('[data-fila="donde"]')).toContainText('Sala 1 · Tentare');
    await expect(page.locator('[data-fila="plazas"]')).toHaveText('10 plazas · 10 libres');
    await expect(page.locator('[data-fila="cancelacion"]')).toBeVisible();
    await expect(page.locator('[data-fila="creditos"]')).toHaveText('+10 créditos al asistir');

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOVIL.width);
    expect(a.sinMockear()).toEqual([]);
    const pedidas = Object.keys(a.llamadas());
    expect(pedidas, 'la ficha no ha pedido ni su payload: el test no prueba nada').toContain('/api/public/studio-data');
    expect(pedidas.filter((r) => !RUTAS_DE_LA_FICHA.has(r)), 'la ficha pide algo que no pedía').toEqual([]);
  });

  test('cuota con tope: «Incluida en tu cuota» y su tope, sin contador de sesiones', async ({ page }) => {
    await abrir(page, { bono: null, cuota: { limiteSemanal: 2 } });
    const cv = page.getByTestId('como-vienes');
    await expect(cv).toContainText('Incluida en tu cuota');
    await expect(cv).toContainText('hasta 2 clases a la semana');
    await expect(cv).not.toContainText(/Te quedan|sesi/);
  });

  test('cuota + bono acotado a Reformer: la fila corta, la tarjeta y la hoja dicen CUOTA (la mensual gana)', async ({ page }) => {
    await abrir(page, { bono: null, cuotaYBonoAcotado: true });
    await expect(page.getByTestId('pago-corto')).toHaveText('Incluida en tu cuota');
    await expect(page.getByTestId('como-vienes')).toContainText('Incluida en tu cuota');
    await page.getByRole('button', { name: /^Reservar$/ }).click();
    await expect(page.getByText('Incluida en tu mensualidad. No pagas nada hoy.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar 10:00 con tu cuota' })).toBeVisible();
    await expect(page.getByText(/Te quedan/)).toHaveCount(0);
  });

  test('su clase fija: «Es tu clase fija», y «Incluida en tu cuota» solo con una cuota que la cubra', async ({ page }) => {
    await abrir(page, { bono: null, cuota: true, reservaFija: true });
    const cv = page.getByTestId('como-vienes');
    await expect(cv).toContainText('Es tu clase fija');
    await expect(cv).toContainText('Incluida en tu cuota');
  });

  test('su clase fija sin cuota: solo «Es tu clase fija», sin prometer quién la paga', async ({ page }) => {
    await abrir(page, { bono: null, reservaFija: true });
    const cv = page.getByTestId('como-vienes');
    await expect(cv).toContainText('Es tu clase fija');
    await expect(cv).not.toContainText('Incluida');
  });

  test('una reserva normal ya hecha: no se dice con qué se pagó (no se sabe)', async ({ page }) => {
    await abrir(page, { reservada: true });
    await expect(page.locator('[data-fila="plazas"]')).toBeVisible();
    await expect(page.getByTestId('como-vienes')).toHaveCount(0);
  });

  test('bono que no cubre: la tarjeta lo dice con sus palabras, y la frase de la hoja sale UNA vez', async ({ page }) => {
    await abrir(page, { bonoQueNoCubre: true });
    await expect(page.getByTestId('como-vienes')).toContainText('Tu Bono Mat no sirve para Reformer');
    await page.getByRole('button', { name: /^Reservar$/ }).click();
    await expect(page.getByText(/tu bono no incluye este tipo de clase/i)).toHaveCount(1);
  });

  test('«Cómo llegar» abre Mapas con la dirección y la ciudad del estudio', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __abiertos: string[] };
      w.__abiertos = [];
      window.open = ((u?: string | URL) => { w.__abiertos.push(String(u)); return null; }) as typeof window.open;
    });
    await abrir(page);
    await page.locator('[data-fila="donde"]').getByRole('button', { name: /Cómo llegar/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __abiertos: string[] }).__abiertos.length)).toBeGreaterThan(0);
    const [url] = await page.evaluate(() => (window as unknown as { __abiertos: string[] }).__abiertos);
    expect(url).toMatch(/^https:\/\/maps\.(apple|google)\.com\/\?q=Calle%20Test%201%2C%20M%C3%A1laga$/);
  });

  test('«Escribe al estudio» lleva a la bandeja de mensajes', async ({ page }) => {
    await abrir(page);
    await expect(page.getByTestId('escribe-al-estudio')).toHaveAttribute('href', `${base}/mensajes`);
  });

  test('con la clase empezada: ni compartir, ni «libres», ni ningún «Reservar»', async ({ page }) => {
    await abrir(page, { ajustar: () => {} });
    await page.clock.setFixedTime(new Date('2026-08-12T10:30:00+02:00'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('reserva-cerrada')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('compartir-clase')).toHaveCount(0);
    await expect(page.locator('[data-fila="plazas"]')).toHaveText('10 plazas');
    await expect(page.getByRole('button', { name: /^Reservar/ })).toHaveCount(0);
  });

  test('en escritorio, las dos columnas: los datos a la izquierda y el resto a la derecha', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrir(page);
    const a = await page.locator('[data-bloque="a"]').boundingBox();
    const b = await page.locator('[data-bloque="b"]').boundingBox();
    expect(b!.x, 'el bloque B no va a la derecha del A').toBeGreaterThanOrEqual(a!.x + a!.width - 1);
  });
});
