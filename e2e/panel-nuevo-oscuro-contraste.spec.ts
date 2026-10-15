import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';
import { ilegibles } from './medir-contraste';

// ─────────────────────────────────────────────────────────────────────────────
// El panel NUEVO en modo oscuro, medido por contraste (WCAG AA: 4,5:1, o 3:1 si
// el texto es grande). `oscuro-contraste.spec.ts` mide el panel de siempre con
// un estudio vacío; este, el panel nuevo (interruptor `panelNuevo`) con el
// estudio sembrado de `panel-sembrado.ts`, que es donde salen sus cifras, sus
// chapas, sus tintes (`fondoTenido`, `TONOS`) y sus vacíos. Mismo medidor
// (`medir-contraste.ts`). Cada pantalla tiene que medir más de 30 textos: un
// barrido que no ha mirado nada no puede dar verde.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 180_000 });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string) {
  await enOscuro(page);
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await ir(page, ruta);
}

/** Mide hasta que la pantalla tiene texto (o se rinde), y devuelve lo que no llega a AA. */
async function medir(page: Page, nombre: string) {
  let r = await ilegibles(page);
  // Como el guardia de siempre: el `next dev` compila la ruta en la primera petición y,
  // bajo carga, a veces responde con su 404 antes de terminar (se recarga); el esqueleto
  // de carga, en cambio, se espera.
  for (let i = 0; i < 25 && r.medidos <= 30; i++) {
    await page.waitForTimeout(2000);
    if (await page.getByText('Esta página no existe').count()) await page.reload({ waitUntil: 'domcontentloaded' });
    r = await ilegibles(page);
  }
  // Las animaciones de entrada (opacidad) se dejan terminar antes de la medida buena.
  await page.waitForTimeout(800);
  r = await ilegibles(page);
  await page.screenshot({ path: `test-results/oscuro-nuevo-${nombre}.png`, fullPage: true });
  expect(r.medidos, `${nombre}: solo ${r.medidos} textos medidos (¿no llegó a pintarse?)`).toBeGreaterThan(30);
  return r.out.map(m => `${nombre}  ${m.ratio}:1  «${m.texto}»  tinta=${m.color} fondo=${m.fondo}  ${m.clases}`);
}

const PANTALLAS: [string, string][] = [
  ['resumen', 'dashboard'],
  ['clientas', 'clientas'],
  ['ficha-clienta', 'clientas/soc-1'],
  ['cobros', 'cobros'],
  ['paquetes', 'productos'],
  ['informes', 'informes'],
  ['configuracion', 'configuracion'],
  ['modulos', 'explorar-funciones'],
  ['automatizaciones', 'automatizaciones'],
];

for (const [nombre, ruta] of PANTALLAS) {
  test(`oscuro, panel nuevo: ${nombre} sin texto por debajo de AA`, async ({ page }) => {
    await abrir(page, ruta);
    const malos = await medir(page, nombre);
    expect(malos, 'texto por debajo del contraste mínimo en oscuro').toEqual([]);
  });
}

test('oscuro, panel nuevo: Calendario (Semana, Horario por clase y por alumna) sin texto por debajo de AA', async ({ page }) => {
  await abrir(page, 'calendario');
  const malos = await medir(page, 'calendario-semana');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Por clase' })).toBeVisible({ timeout: 30_000 });
  malos.push(...await medir(page, 'calendario-horario-clase'));
  await page.getByRole('button', { name: 'Por alumna' }).click();
  malos.push(...await medir(page, 'calendario-horario-alumna'));
  expect(malos, 'texto por debajo del contraste mínimo en oscuro').toEqual([]);
});
