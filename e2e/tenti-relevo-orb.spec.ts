import { test, expect, type Page, type Route } from '@playwright/test';
import { montarHome } from './hoy-home-mock';
import { montar, ir } from './panel-sembrado';
import { HUELLA_DEL_MOTOR, recolectarScripts } from './recolector-scripts';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti releva al Orb (5-oct-2026, decisión del fundador): donde estaba el Orb
// va Tenti, en icono SVG y quieto. Lo que se fija aquí, en las pantallas donde
// se ve a diario:
//   · está en cada sitio donde estaba el Orb, y en ninguno más de la pantalla;
//   · en reposo, siempre: ni un recuento, ni algo esperando tu visto bueno, ni
//     el interruptor del piloto le cambian la cara (eso lo dice el texto);
//   · es decorativo (aria-hidden): su nombre no se cuela en el del enlace;
//   · no hay ninguna animación corriendo en él, y el motor del canvas no viaja
//     con ninguna de estas pantallas.
// Los dos sitios donde piensa (un botón de IA y «Analizar») tienen su prueba
// junto a su andamiaje: preparar-clase-ia.spec.ts y migracion-mapeo-de-planes.
// Cuántos hay y dónde, en el código, lo vigila lib/tenti/donde-vive-tenti.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

// En local cada pantalla se compila la primera vez que se pide (en CI se sirve
// ya construida).
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, body: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const tenti = (page: Page) => page.locator('[data-tenti-icono]');

/** Todos los Tentis de la página en reposo y decorativos, y ningún resto del Orb ni del canvas. */
async function todosQuietosYDecorativos(page: Page) {
  for (const t of await tenti(page).all()) {
    await expect(t).toHaveAttribute('data-estado', 'reposo');
    await expect(t).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(page.locator('.orb-tentare')).toHaveCount(0);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
}

/** Animaciones sin fin corriendo dentro de un Tenti. En reposo no hay ninguna:
 *  respirar es solo de 'pensando', con una petición en vuelo. */
const animacionesSinFin = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => {
  const objetivo = (a.effect as KeyframeEffect | null)?.target as Element | null;
  return a.playState === 'running' && a.effect?.getTiming().iterations === Infinity && !!objetivo?.closest('[data-tenti-icono]');
}).length);

// Algo en marcha y algo resuelto: así se pintan los dos bloques de la bandeja.
const BANDEJA_CON_MARCHA = {
  aplica: true, nDecidir: 0, titulo: 'Nada espera tu visto bueno', decidir: [],
  enMarcha: [{ id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' }],
  resuelto: [{ id: 'sustitucionesCubiertas24h', n: 1, texto: 'Una clase cubierta por una sustituta', href: '/sustituciones' }],
};

test.describe('Resumen: Tenti en los tres sitios donde estaba el Orb', () => {
  test('la propietaria lo ve en el enlace de automatizaciones, en la tira del día y en lo que Tentare está haciendo', async ({ page }) => {
    const scripts = recolectarScripts(page);
    await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });

    const banner = page.getByRole('link', { name: /Sistema autónomo/ });
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner.locator('svg[data-tenti-icono][aria-hidden="true"]')).toHaveCount(1);
    // Decorativo: el enlace se sigue llamando como dice su texto.
    await expect(page.getByRole('link', { name: /Tenti/i })).toHaveCount(0);

    // La tira de lo que ha visto Tentare en la agenda (la agenda del arnés
    // tiene huecos y una clase sin instructora).
    const tira = page.getByText(/^Tentare ha encontrado/);
    await expect(tira).toBeVisible();
    await expect(tira.locator('xpath=..').locator('[data-tenti-icono]')).toHaveCount(1);

    // La bandeja: Tenti firma lo que está en marcha; lo resuelto lleva su Check.
    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja.getByText('Tentare lo está haciendo').locator('[data-tenti-icono]')).toHaveCount(1);
    await expect(bandeja.getByText('Resuelto por Tentare').locator('svg.lucide-check')).toHaveCount(1);
    await expect(bandeja.getByText('Resuelto por Tentare').locator('[data-tenti-icono]')).toHaveCount(0);

    await expect(tenti(page)).toHaveCount(3);
    await todosQuietosYDecorativos(page);
    await page.waitForTimeout(3_000);
    expect(await animacionesSinFin(page)).toBe(0);
    expect(await scripts.cuantos()).toBeGreaterThan(0);
    expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(false);
  });

  for (const rol of ['RECEPCION', 'MANAGER'] as const) {
    test(`${rol}: sin el enlace de automatizaciones, pero con Tenti donde lo veía el Orb`, async ({ page }) => {
      await montarHome(page, { rol, estadoEstudio: BANDEJA_CON_MARCHA });
      await expect(page.getByText(/^Tentare ha encontrado/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' }).getByText('Tentare lo está haciendo')).toBeVisible();
      // /automatizaciones es solo de la propietaria: su enlace no está.
      await expect(page.getByRole('link', { name: /Sistema autónomo/ })).toHaveCount(0);
      await expect(tenti(page)).toHaveCount(2);
      await todosQuietosYDecorativos(page);
    });
  }
});

function logPendiente() {
  return {
    id: 'log-pend', studio_id: 'studio-test', rule_id: null, rule_name: 'Aviso de cobro pendiente',
    socio_id: null, socio_nombre: null, paso_index: 0, accion: 'ENVIAR_EMAIL',
    resultado: 'PENDIENTE_ADMIN', detalle: null, mensaje_cliente: null,
    ejecutado_en: new Date().toISOString(), proxima_accion_en: null, recibo_id: null, automatizacion_id: null,
  };
}

test.describe('Automatizaciones: Tenti en el resumen del día y en «Esto ya lo hace Tentare»', () => {
  test('dos Tentis quietos, y el resumen solo afirma lo que cuenta', async ({ page }) => {
    const scripts = recolectarScripts(page);
    await montar(page);
    await ir(page, 'automatizaciones');

    // Lo que cuenta son las automatizaciones que esperan tu visto bueno, no
    // «nada pendiente» en general (ese era el texto, y no era verdad).
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno\./)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Hoy no tienes nada pendiente/)).toHaveCount(0);
    await expect(tenti(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Reglas', exact: true }).click();
    const hecho = page.getByRole('heading', { name: 'Esto ya lo hace Tentare, sin que configures nada' });
    await expect(hecho).toBeVisible();
    await expect(hecho.locator('xpath=..').locator('[data-tenti-icono]')).toHaveCount(1);
    await expect(tenti(page)).toHaveCount(2);
    await todosQuietosYDecorativos(page);
    await page.waitForTimeout(3_000);
    expect(await animacionesSinFin(page)).toBe(0);
    expect(await scripts.cuantos()).toBeGreaterThan(0);
    expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(false);
  });

  test('con algo esperando tu visto bueno, Tenti no cambia de cara: lo dice el texto', async ({ page }) => {
    await montar(page);
    // DESPUÉS del arnés: la última ruta registrada gana.
    let lecturas = 0;
    await page.route('**/rest/v1/automation_logs**', (r) => { lecturas++; return json(r, [logPendiente()]); });
    await ir(page, 'automatizaciones');

    await expect(page.getByText(/requieren tu atención/)).toBeVisible({ timeout: 60_000 });
    expect(lecturas).toBeGreaterThan(0);
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno/)).toHaveCount(0);
    await expect(tenti(page)).toHaveCount(1);
    await todosQuietosYDecorativos(page);
  });
});

test('Importar clientas: el enlace a la migración automática lleva a Tenti, y ningún ✨', async ({ page }) => {
  await montar(page);
  await ir(page, 'clientas/importar');
  const enlace = page.getByRole('link', { name: /Vienes de otro software/ });
  await expect(enlace).toBeVisible({ timeout: 60_000 });
  await expect(enlace).toHaveAttribute('href', '/migracion');
  await expect(enlace.locator('[data-tenti-icono]')).toHaveCount(1);
  await expect(tenti(page)).toHaveCount(1);
  await todosQuietosYDecorativos(page);
  await expect(page.getByText('✨')).toHaveCount(0);
});

test('Centro de Control: el Piloto automático lleva a Tenti, quieto con el interruptor apagado y encendido', async ({ page }) => {
  const scripts = recolectarScripts(page);
  await montar(page);
  // El guardado del interruptor: devuelve lo que recibe, como el servidor
  // cuando acepta. DESPUÉS del arnés, que contesta al GET.
  let guardados = 0;
  await page.route((u) => u.pathname === '/api/decisiones/autonomia', (r) => {
    if (r.request().method() !== 'PUT') return r.fallback();
    guardados++;
    return json(r, { config: r.request().postDataJSON() });
  });
  await ir(page, 'centro-de-control');

  await page.getByRole('button', { name: 'Ver todo el detalle' }).click({ timeout: 60_000 });
  const piloto = page.locator('div.rounded-3xl', { has: page.getByRole('heading', { name: 'Piloto automático' }) });
  await expect(piloto).toBeVisible();
  await expect(piloto.locator('[data-tenti-icono]')).toHaveCount(1);
  // El único de la pantalla: el veredicto y las filas los puede redactar un
  // modelo, y ahí no va ninguna cara.
  await expect(tenti(page)).toHaveCount(1);
  await todosQuietosYDecorativos(page);

  const interruptor = page.getByRole('switch', { name: 'Activar piloto automático' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  expect(guardados).toBeGreaterThan(0);
  // Encendido, Tenti sigue igual: si el piloto va o no lo dice el interruptor.
  await expect(piloto.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
  expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(false);
});

test('las tres preguntas de apertura: Tenti donde estaba el Orb', async ({ page }) => {
  await montar(page);
  let lecturas = 0;
  await page.route((u) => u.pathname === '/api/opening', (r) => { lecturas++; return json(r, { visible: true, onboarding: null }); });
  await ir(page, 'bienvenido-apertura');
  await expect(page.getByRole('heading', { name: 'Una última cosa antes de entrar' })).toBeVisible({ timeout: 60_000 });
  expect(lecturas).toBeGreaterThan(0);
  await expect(tenti(page)).toHaveCount(1);
  await todosQuietosYDecorativos(page);
});

test('Migración: el motor del canvas no viaja con la pantalla de Analizar', async ({ page }) => {
  const scripts = recolectarScripts(page);
  await montar(page);
  await ir(page, 'migracion');
  await expect(page.getByRole('heading', { level: 1, name: 'Traer mis datos' })).toBeVisible({ timeout: 60_000 });
  expect(await scripts.cuantos()).toBeGreaterThan(0);
  expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(false);
});
