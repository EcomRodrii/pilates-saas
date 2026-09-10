import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La barra de un bono: cuánto queda, y de qué color.
//
// ⚠️ Iba pintada a mano con `--success` fijo, y eso rompía dos cosas a la vez:
//
//  · `--success` NO se tiñe con la marca del estudio (a propósito: es el verde
//    de «ha ido bien», no un color de identidad). Las sesiones que te quedan no
//    son un éxito, son una cantidad — y salían en verde en los trece estudios,
//    todos de marca índigo, violeta o tostada.
//  · Con una sesión o menos la ETIQUETA ya se pone ámbar y la barra seguía
//    verde: la misma tarjeta diciendo «cuidado» y «todo bien» a la vez.
//
// Se mide el color COMPUTADO, no la clase: una clase puesta sin que el CSS la
// defina pasaría un test de clases y no pintaría nada distinto.

const base = `/portal/${SLUG}`;
/** Marca del estudio bien lejos del verde, para que la diferencia se vea. */
const MARCA = '#4B2E83';

async function montar(page: Page, restantes: number | null, estado = 'ACTIVA') {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
  (f.socia as Record<string, unknown>).suscripciones = [{
    id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado,
    sesionesRestantes: restantes, fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
  }];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/theme**', (r) => r.fulfill(json({ primary: MARCA, secondary: MARCA, logoUrl: null, radius: 12 })));
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

/** El color real del relleno de la barra, y el acento del estudio, para comparar. */
async function colores(page: Page) {
  await expect(page.getByText('Bono 8 sesiones').first()).toBeVisible({ timeout: 30_000 });
  return page.evaluate(() => {
    const i = document.querySelector('.bar > i');
    const raiz = document.querySelector('.student-app') ?? document.documentElement;
    return {
      relleno: i ? getComputedStyle(i).backgroundColor : null,
      acento: getComputedStyle(raiz).getPropertyValue('--accent').trim(),
      exito: getComputedStyle(raiz).getPropertyValue('--success').trim(),
      aviso: getComputedStyle(raiz).getPropertyValue('--warning').trim(),
    };
  });
}

/** '#4B8256' → 'rgb(75, 130, 86)', para comparar con lo computado. */
function aRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test.describe('Student PWA · la barra de un bono', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('lleva el color del estudio, no el verde de «ha ido bien»', async ({ page }) => {
    await montar(page, 5);
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    const c = await colores(page);
    expect(c.acento, 'el tema del estudio no ha llegado a la pantalla').toBeTruthy();
    expect(c.relleno, 'la barra sigue con el verde del sistema').not.toBe(aRgb(c.exito));
    expect(c.relleno).toBe(aRgb(c.acento));
  });

  test('con una sesión, la barra dice lo mismo que la etiqueta', async ({ page }) => {
    // La etiqueta ya se ponía ámbar aquí. La barra seguía verde.
    await montar(page, 1);
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    const c = await colores(page);
    expect(c.relleno, 'la etiqueta avisa y la barra celebra').toBe(aRgb(c.aviso));
  });

  test('un bono expirado no se pinta de la marca: no queda nada que gastar', async ({ page }) => {
    // Conserva su porcentaje —pudo caducar con sesiones dentro— así que del
    // color de marca parecería disponible.
    await montar(page, 5, 'CANCELADA');
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    const c = await colores(page);
    expect(c.relleno).not.toBe(aRgb(c.acento));
    expect(c.relleno).not.toBe(aRgb(c.exito));
  });
});
