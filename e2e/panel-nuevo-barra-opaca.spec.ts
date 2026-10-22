import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La barra de arriba del panel es OPACA (decisión 9 de «Mi app y mi web», 15-oct-2026).
// Antes era un glass al 80 % con desenfoque y lo que pasaba por debajo se leía a
// medias detrás de ella. Se mide en el navegador, en claro y en oscuro: fondo sin
// transparencia, sin desenfoque, y el contraste del texto de la barra contra ese fondo.
//
// Con CAPTURAS=<dir> (y opcional ANTES=1, que reinyecta el CSS anterior) también
// deja capturas de varias pantallas con el contenido pasando por debajo.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 420_000 });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const PANTALLAS: [string, string][] = [
  ['resumen', 'dashboard'],
  ['clientas', 'clientas'],
  ['calendario', 'calendario'],
  ['configuracion-web', 'configuracion?tab=web'],
];
const CAPTURAS = process.env.CAPTURAS;
const ANTES = process.env.ANTES === '1';

async function abrir(page: Page, ruta: string, ancho: number, alto: number, oscuro: boolean) {
  await page.setViewportSize({ width: ancho, height: alto });
  await montar(page);
  if (oscuro) await enOscuro(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true, 
  }));
  await ir(page, ruta);
  if (ANTES) {
    // El CSS de antes, tal cual: fondo al 80 % y su desenfoque.
    await page.addStyleTag({ content: '[data-panel-topbar]{background-color:color-mix(in srgb,var(--background) 80%,transparent)!important;backdrop-filter:blur(12px)!important}' });
  }
}

const luz = (c: number[]) => {
  const l = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contraste = (a: number[], b: number[]) => {
  const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const oscuro of [false, true]) {
  test(`${oscuro ? 'oscuro' : 'claro'}: la barra de arriba no deja pasar nada y su texto se lee`, async ({ page }) => {
    test.skip(ANTES, 'el modo ANTES solo hace capturas');
    await abrir(page, 'clientas', 1440, 900, oscuro);
    const barra = page.locator('[data-panel-topbar]');
    await expect(barra).toBeVisible({ timeout: 300_000 });
    const m = await barra.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rgba = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
      const texto = el.querySelector('button[aria-label], [data-tour="buscador"]');
      // Tinta secundaria de los iconos de la barra (la que más sufría con un fondo a medias).
      const ico = el.querySelector('[class*="text-muted-foreground"]');
      const sec = ico ? getComputedStyle(ico).color : cs.color;
      return { fondo: rgba(cs.backgroundColor), desenfoque: cs.backdropFilter, tinta: rgba(cs.color), secundaria: rgba(sec), hay: !!texto };
    });
    const alfa = m.fondo.length === 4 ? m.fondo[3] : 1;
    expect(alfa, `fondo con transparencia: ${m.fondo}`).toBe(1);
    expect(m.desenfoque === 'none' || m.desenfoque === '' || m.desenfoque === undefined, `desenfoque: ${m.desenfoque}`).toBeTruthy();
    const fondo = m.fondo.slice(0, 3);
    const cTinta = contraste(m.tinta.slice(0, 3), fondo);
    const cSec = contraste(m.secundaria.slice(0, 3), fondo);
    console.log(`CONTRASTE ${oscuro ? 'oscuro' : 'claro'}: fondo rgb(${fondo}) · tinta ${cTinta.toFixed(2)}:1 · iconos ${cSec.toFixed(2)}:1`);
    expect(cTinta).toBeGreaterThanOrEqual(4.5);
    expect(cSec).toBeGreaterThanOrEqual(3);
  });
}

test('el contenido que pasa por debajo no se ve a través de la barra (sin aceptación de glass)', async ({ page }) => {
  test.skip(ANTES, 'el modo ANTES solo hace capturas');
  await abrir(page, 'clientas', 1440, 900, false);
  await expect(page.locator('[data-panel-topbar]')).toBeVisible({ timeout: 300_000 });
  // Un elemento cualquiera detrás de la barra: el punto bajo su centro lo ocupa ella, no el contenido.
  const tapa = await page.evaluate(() => {
    const b = document.querySelector('[data-panel-topbar]')!.getBoundingClientRect();
    const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!e && !!e.closest('[data-panel-topbar]');
  });
  expect(tapa).toBe(true);
});

test.describe('capturas', () => {
  test.skip(!CAPTURAS, 'solo con CAPTURAS=<dir>');
  // A 375 px la barra de arriba no existe (`hidden lg:flex`): en el móvil manda la cabecera móvil, que no cambia.
  for (const [w, h] of [[1440, 900]] as const) {
    for (const oscuro of [false, true]) {
      for (const [nombre, ruta] of PANTALLAS) {
        test(`${ANTES ? 'antes' : 'despues'} ${w} ${oscuro ? 'oscuro' : 'claro'} ${nombre}`, async ({ page }) => {
          await abrir(page, ruta, w, h, oscuro);
          // Cargada de verdad: la barra pintada y ni un esqueleto (una captura gris no vale).
          await expect(page.locator('[data-panel-topbar]')).toBeVisible({ timeout: 300_000 });
          await page.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 180_000 });
          await page.waitForTimeout(800);
          await page.mouse.move(w / 2, h / 2);
          // Se baja con la rueda sobre el contenido: lo que sube pasa por debajo de la barra.
          await page.mouse.move(w * 0.6, h * 0.6);
          await page.mouse.wheel(0, 220);
          await page.waitForTimeout(500);
          await page.screenshot({ path: `${CAPTURAS}/${ANTES ? 'antes' : 'despues'}-${w}-${oscuro ? 'oscuro' : 'claro'}-${nombre}.png` });
        });
      }
    }
  }
});
