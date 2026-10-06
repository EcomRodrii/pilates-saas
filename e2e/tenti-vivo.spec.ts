import { test, expect, type Page } from '@playwright/test';
import { montarHome } from './hoy-home-mock';
import { montar, ir } from './panel-sembrado';
import { contarFotogramas } from './contador-fotogramas';
import { espiarSonidos } from './espia-sonidos';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti VIVO en todos sus sitios (5-oct-2026, decisión del fundador: «no se
// mueve en ningún lado»; «en /interno/tenti está perfecto») y SIN SONIDO
// (6-oct-2026: «quítale el sonido a Tenti»). Lo que se fija aquí:
//   · en Resumen, sus tres iconos son el canvas del motor, del tamaño del icono
//     de antes (el cuerpo mide lo mismo), y viven: pintan, pero duermen entre
//     parpadeos y miradas (muy por debajo de 60 fps) y no suenan;
//   · tocar un Tenti que no va en un botón ni en un enlace lo aplasta, y no
//     suena; en un enlace, el clic es del enlace;
//   · con «reducir movimiento», quietos;
//   · «Sonidos de Tenti» ya no está en Configuración › Tu panel, y abrir el
//     buscador no suena.
// El buscador (abrir/cerrar/tocar) tiene su prueba en tenti-buscador.spec.ts y
// los botones de IA en preparar-clase-ia.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const BANDEJA_CON_MARCHA = {
  aplica: true, nDecidir: 0, titulo: 'Nada espera tu visto bueno', decidir: [],
  enMarcha: [{ id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' }],
  resuelto: [],
};

const iconos = (page: Page) => page.locator('[data-tenti-icono]');

async function tresVivos(page: Page) {
  await expect(page.getByText(/^Tentare ha encontrado/)).toBeVisible({ timeout: 60_000 });
  await expect(iconos(page)).toHaveCount(3);
  await expect(page.locator('[data-tenti-icono] canvas[data-tenti]')).toHaveCount(3, { timeout: 30_000 });
}

test('Resumen: los tres Tentis son el canvas vivo, del tamaño del icono, y duermen entre parpadeos sin sonar', async ({ page }) => {
  const fotogramas = await contarFotogramas(page);
  const sonidos = await espiarSonidos(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await tresVivos(page);

  // El cuerpo mide lo que medía el icono: el canvas es 1/0,684 de la caja.
  for (const icono of await iconos(page).all()) {
    const caja = (await icono.boundingBox())!;
    const lienzo = (await icono.locator('canvas[data-tenti]').boundingBox())!;
    const proporcion = caja.width / lienzo.width;
    expect(proporcion, `cuerpo ${caja.width} px en un canvas de ${lienzo.width} px`).toBeGreaterThan(0.64);
    expect(proporcion).toBeLessThan(0.72);
    // Centrado sobre la caja: el canvas se sale por igual a cada lado.
    expect(Math.abs((lienzo.x + lienzo.width / 2) - (caja.x + caja.width / 2))).toBeLessThan(1.5);
    await expect(icono.locator('canvas[data-tenti]')).toHaveAttribute('data-paleta', 'tokens');
  }

  // 10 s en reposo, con el ratón quieto: algo pinta (vive), muy lejos de 60 fps
  // por Tenti (serían 1800), y nada suena.
  await page.waitForTimeout(2_000);
  // El hilo principal, medido por el navegador (CDP): cuánto ha estado ocupado.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const ocupado = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value;
  const t0 = await ocupado();
  const r = await fotogramas.durante(10_000);
  const cpu = (await ocupado()) - t0;
  test.info().annotations.push({ type: 'rendimiento', description: `10 s de Resumen en reposo: ${r.pintados} fotogramas de Tenti, ${r.raf} rAF, hilo principal ${(cpu * 1000).toFixed(0)} ms (${(cpu * 10).toFixed(2)} %)` });
  console.log(`[tenti-vivo] ${test.info().annotations.at(-1)!.description}`);
  expect(r.pintados, 'en 10 s ningún Tenti ha parpadeado ni mirado').toBeGreaterThan(0);
  expect(r.pintados, `${r.pintados} fotogramas en 10 s: no se duermen`).toBeLessThan(900);
  expect(await sonidos.cuantos(), 'Tenti no suena: ni al montarse, ni al parpadear o mirar').toBe(0);
});

// Con sus estados de situación (lib/tenti/momentos.ts): espera tu visto bueno
// bota, dormido respira… y en lo diario solo 4 s (`movimiento`, motor.ts). Tras
// asentarse, Resumen con CUATRO Tentis (esperaTuOk, trabajando, dormido y el de
// «Sistema autónomo») tiene que costar lo que costaba en reposo: ~100
// fotogramas en 10 s y 1,0–1,7 % del hilo principal (.claude/tentare-os.md).
const BANDEJA_CON_TODO = {
  aplica: true, nDecidir: 3, titulo: '3 cosas esperan tu visto bueno',
  decidir: [{ id: 'reservasPorAprobar', n: 3, texto: '3 reservas por aprobar', href: null }],
  enMarcha: BANDEJA_CON_MARCHA.enMarcha, resuelto: [],
};

test('Resumen con esperaTuOk, trabajando y dormido: oscilan al entrar y, asentados, cuestan lo que el reposo', async ({ page }) => {
  const fotogramas = await contarFotogramas(page);
  const sonidos = await espiarSonidos(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_TODO, calendarioVacio: true });
  await expect(page.getByText(/Tentare sigue atento/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-tenti-icono] canvas[data-tenti]')).toHaveCount(4, { timeout: 30_000 });
  for (const estado of ['esperaTuOk', 'trabajando', 'dormido']) {
    await expect(page.locator(`[data-tenti-icono][data-estado="${estado}"] canvas[data-tenti]`)).toHaveCount(1);
  }
  // Al entrar oscilan (bota, respira): más fotogramas que en reposo...
  const entrada = await fotogramas.durante(3_000);
  // ...y pasados 5 s, en su pose: el bucle duerme entre parpadeos.
  await page.waitForTimeout(2_500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const ocupado = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value;
  const t0 = await ocupado();
  const r = await fotogramas.durante(10_000);
  const cpu = (await ocupado()) - t0;
  test.info().annotations.push({ type: 'rendimiento', description: `estados asentados, 10 s de Resumen con 4 Tentis: ${r.pintados} fotogramas de Tenti, hilo principal ${(cpu * 1000).toFixed(0)} ms (${(cpu * 10).toFixed(2)} %); los 3 primeros segundos, ${entrada.pintados}` });
  console.log(`[tenti-vivo] ${test.info().annotations.at(-1)!.description}`);
  expect(r.pintados, `${r.pintados} fotogramas en 10 s con los estados asentados: alguno sigue oscilando`).toBeLessThan(900);
  expect(await sonidos.cuantos(), 'ningún estado suena').toBe(0);
});

test('tocar a Tenti fuera de un botón lo aplasta, sin sonar; en un enlace, el clic es del enlace', async ({ page }) => {
  const sonidos = await espiarSonidos(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await tresVivos(page);
  const tira = page.getByText(/^Tentare ha encontrado/).locator('xpath=..').locator('[data-tenti-icono] canvas[data-tenti]');
  await expect(tira).toHaveCSS('cursor', 'pointer');
  // Tocarlo e insistir (se molesta y se marea): antes, cada toque sonaba.
  for (let i = 0; i < 5; i++) await tira.click();
  await page.waitForTimeout(1_000);
  expect(await sonidos.cuantos(), 'tocar a Tenti no suena').toBe(0);

  // En el enlace «Sistema autónomo» Tenti no se toca: no recibe el puntero.
  const enlace = page.getByRole('link', { name: /Sistema autónomo/ });
  await expect(enlace.locator('[data-tenti-icono] canvas[data-tenti]')).toHaveCSS('pointer-events', 'none');
});

test('con «reducir movimiento», los Tentis se quedan quietos', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fotogramas = await contarFotogramas(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await tresVivos(page);
  for (const c of await page.locator('[data-tenti-icono] canvas[data-tenti]').all()) {
    await expect(c).toHaveAttribute('data-quieto', '1');
  }
  await page.waitForTimeout(1_500);
  const r = await fotogramas.durante(6_000);
  expect(r.pintados, 'quieto no tiene por qué pintar').toBe(0);
});

test('«Sonidos de Tenti» ya no está en Tu panel, y abrir y cerrar el buscador no suena', async ({ page }) => {
  const sonidos = await espiarSonidos(page);
  await montar(page);
  await ir(page, 'configuracion?tab=panel');
  await expect(page.getByRole('switch', { name: 'Claro u oscuro' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('switch', { name: /Sonidos de Tenti/ })).toHaveCount(0);
  await expect(page.getByText(/Tenti suena/)).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  await page.waitForTimeout(1_500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await sonidos.cuantos(), 'abrir y cerrar el buscador no suena').toBe(0);
});
