import { test, expect, type Page, type Route } from '@playwright/test';
import { montarHome } from './hoy-home-mock';
import { montar, ir } from './panel-sembrado';
import { HUELLA_DEL_MOTOR, recolectarScripts } from './recolector-scripts';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti releva al Orb (5-oct-2026, decisión del fundador): donde estaba el Orb
// va Tenti, y desde esa tarde VIVO (el canvas del motor a tamaño de icono, como
// en /interno/tenti). Lo que se fija aquí, en las pantallas donde se ve a
// diario:
//   · está en cada sitio donde estaba el Orb, y en ninguno más de la pantalla;
//   · en reposo, siempre: ni un recuento, ni algo esperando tu visto bueno, ni
//     el interruptor del piloto le cambian la cara (eso lo dice el texto);
//   · es decorativo (aria-hidden): su nombre no se cuela en el del enlace;
//   · cada icono pinta su canvas dentro de su caja, y en reposo no hay ninguna
//     animación CSS sin fin (respirar es de 'pensando'); en Automatizaciones va
//     además el Tenti del resumen del día, en el sitio de la baldosa del Zap (si no puede
//     pintarse, el Zap de siempre).
// El rendimiento, el sonido y tocarlo: e2e/tenti-vivo.spec.ts.
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

/** Todos los Tentis de la página vivos (un canvas por icono, en el mismo
 *  estado que su icono) y decorativos, ningún resto del Orb, y además tantos
 *  canvas sueltos como se digan (solo Automatizaciones lleva uno, el del resumen
 *  del día). Qué estado lleva cada uno lo dice cada test: desde el 5-oct no es
 *  siempre 'reposo' (lib/tenti/momentos.ts). */
async function todosVivosYDecorativos(page: Page, { canvas = 0 } = {}) {
  const iconos = await tenti(page).all();
  for (const t of iconos) {
    await expect(t).toHaveAttribute('aria-hidden', 'true');
    await expect(t.locator('canvas[data-tenti]')).toHaveCount(1, { timeout: 30_000 });
    await expect(t.locator('canvas[data-tenti]')).toHaveAttribute('data-estado', (await t.getAttribute('data-estado'))!);
  }
  await expect(page.locator('.orb-tentare')).toHaveCount(0);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(iconos.length + canvas);
  for (const c of await page.locator('canvas[data-tenti]').all()) {
    await expect(c).toHaveAttribute('aria-hidden', 'true');
  }
}

/** Animaciones CSS sin fin corriendo en un Tenti de icono. En reposo, ninguna:
 *  respirar es de 'pensando', con una petición en vuelo. Lo vivo es el canvas. */
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
    await expect(banner.locator('[data-tenti-icono][aria-hidden="true"]')).toHaveCount(1);
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
    await todosVivosYDecorativos(page);
    // Cada uno en su estado (lib/tenti/momentos.ts): lo que está en marcha,
    // 'trabajando'; los otros dos, la firma.
    await expect(bandeja.getByText('Tentare lo está haciendo').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'trabajando');
    await expect(banner.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
    await expect(tira.locator('xpath=..').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
    expect(await animacionesSinFin(page)).toBe(0);
    // El motor llega, pero aparte (dynamic()): que no viaje en el chunk de la
    // pantalla lo vigila lib/tenti/donde-vive-tenti.test.ts.
    await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
  });

  for (const rol of ['RECEPCION', 'MANAGER'] as const) {
    test(`${rol}: sin el enlace de automatizaciones, pero con Tenti donde lo veía el Orb`, async ({ page }) => {
      await montarHome(page, { rol, estadoEstudio: BANDEJA_CON_MARCHA });
      await expect(page.getByText(/^Tentare ha encontrado/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' }).getByText('Tentare lo está haciendo')).toBeVisible();
      // /automatizaciones es solo de la propietaria: su enlace no está.
      await expect(page.getByRole('link', { name: /Sistema autónomo/ })).toHaveCount(0);
      await expect(tenti(page)).toHaveCount(2);
      await todosVivosYDecorativos(page);
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

const briefing = (page: Page) => page.locator('div.rounded-2xl.bg-primary', { has: page.getByRole('heading', { level: 1 }) });

test.describe('Automatizaciones: Tenti en el resumen del día y en «Esto ya lo hace Tentare»', () => {
  test('los iconos quietos, Tenti vivo en el sitio del Zap, y el resumen solo afirma lo que cuenta', async ({ page }) => {
    const scripts = recolectarScripts(page);
    await montar(page);
    await ir(page, 'automatizaciones');

    // Lo que cuenta son las automatizaciones que esperan tu visto bueno, no
    // «nada pendiente» en general (ese era el texto, y no era verdad).
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno\./)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Hoy no tienes nada pendiente/)).toHaveCount(0);
    await expect(tenti(page)).toHaveCount(1);
    // El canvas, en el sitio de la baldosa del Zap (decisión del fundador del
    // 5-oct): en el resumen, y el Zap ya no está. En el resumen hay dos: ese y
    // el del icono de la fila «Sistema autónomo».
    await expect(briefing(page).locator('canvas[data-tenti]')).toHaveCount(2, { timeout: 30_000 });
    await expect(briefing(page).locator('[data-tenti-icono] canvas[data-tenti]')).toHaveCount(1);
    await expect(briefing(page).locator('svg.lucide-zap')).toHaveCount(0);

    await page.getByRole('button', { name: 'Reglas', exact: true }).click();
    const hecho = page.getByRole('heading', { name: 'Esto ya lo hace Tentare, sin que configures nada' });
    await expect(hecho).toBeVisible();
    await expect(hecho.locator('xpath=..').locator('[data-tenti-icono]')).toHaveCount(1);
    await expect(tenti(page)).toHaveCount(2);
    await todosVivosYDecorativos(page, { canvas: 1 });
    expect(await animacionesSinFin(page)).toBe(0);
    // Esta pantalla sí trae el motor: por su chunk diferido, al pintar el resumen.
    expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(true);
  });

  test('sin canvas 2D, la baldosa del Zap de siempre', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
        if (tipo === '2d') return null;
        return (original as (...a: unknown[]) => RenderingContext | null).call(this, tipo, ...resto);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const scripts = recolectarScripts(page);
    await montar(page);
    await ir(page, 'automatizaciones');
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno\./)).toBeVisible({ timeout: 60_000 });
    // Que el motor haya llegado y no haya podido pintar: si no, el Zap sería el de «cargando».
    await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
    await expect(briefing(page).locator('svg.lucide-zap')).toHaveCount(1);
    await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
    await expect(tenti(page)).toHaveCount(1);
  });

  test('si el chunk de Tenti no llega, la baldosa del Zap de siempre', async ({ page }) => {
    await montar(page);
    // DESPUÉS del arnés. El chunk del motor se reconoce por su contenido: se
    // pide, y si es el del motor se corta.
    let cortados = 0;
    await page.route(/\/_next\/static\/.*\.js/, async (r) => {
      const resp = await r.fetch();
      const cuerpo = await resp.text();
      if (cuerpo.includes(HUELLA_DEL_MOTOR)) { cortados++; return r.abort(); }
      return r.fulfill({ response: resp, body: cuerpo });
    });
    await ir(page, 'automatizaciones');
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno\./)).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => cortados, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(briefing(page).locator('svg.lucide-zap')).toHaveCount(1);
    await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
  });

  test('con algo esperando y la bandeja sin contestar, el texto lo dice y la cara no lo afirma', async ({ page }) => {
    await montar(page);
    // DESPUÉS del arnés: la última ruta registrada gana.
    let lecturas = 0;
    await page.route('**/rest/v1/automation_logs**', (r) => { lecturas++; return json(r, [logPendiente()]); });
    await ir(page, 'automatizaciones');

    await expect(page.getByText(/1 caso que requiere tu atención/)).toBeVisible({ timeout: 60_000 });
    expect(lecturas).toBeGreaterThan(0);
    await expect(page.getByText(/^Ninguna automatización espera tu visto bueno/)).toHaveCount(0);
    await expect(tenti(page)).toHaveCount(1);
    await expect(briefing(page).locator('canvas[data-tenti]')).toHaveCount(2, { timeout: 30_000 });
    await todosVivosYDecorativos(page, { canvas: 1 });
    // La bandeja del arnés es `{}`: sin su cifra, la cara no afirma nada
    // (lib/tenti/momentos.ts, estadoDelAutonomo).
    await expect(briefing(page).locator('.size-14 canvas[data-tenti]')).toHaveAttribute('data-estado', 'reposo');
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
  await todosVivosYDecorativos(page);
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
  await todosVivosYDecorativos(page);

  const interruptor = page.getByRole('switch', { name: 'Activar piloto automático' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  expect(guardados).toBeGreaterThan(0);
  // Encendido, Tenti sigue igual: si el piloto va o no lo dice el interruptor.
  await expect(piloto.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
  await expect(piloto.locator('canvas[data-tenti]')).toHaveAttribute('data-estado', 'reposo');
  expect(await scripts.contiene(HUELLA_DEL_MOTOR)).toBe(true);
});

test('las tres preguntas de apertura: Tenti donde estaba el Orb', async ({ page }) => {
  await montar(page);
  let lecturas = 0;
  await page.route((u) => u.pathname === '/api/opening', (r) => { lecturas++; return json(r, { visible: true, onboarding: null }); });
  await ir(page, 'bienvenido-apertura');
  await expect(page.getByRole('heading', { name: 'Una última cosa antes de entrar' })).toBeVisible({ timeout: 60_000 });
  expect(lecturas).toBeGreaterThan(0);
  await expect(tenti(page)).toHaveCount(1);
  // Son preguntas que se pueden dejar para luego: 'pregunta' (lib/tenti/momentos.ts).
  await expect(tenti(page)).toHaveAttribute('data-estado', 'pregunta');
  await todosVivosYDecorativos(page);
});

test('sin canvas 2D, cada icono es el Tenti quieto de siempre, en su misma caja', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
      if (tipo === '2d') return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, tipo, ...resto);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  const scripts = recolectarScripts(page);
  await montarHome(page, { estadoEstudio: BANDEJA_CON_MARCHA });
  await expect(page.getByText(/^Tentare ha encontrado/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => scripts.contiene(HUELLA_DEL_MOTOR), { timeout: 30_000 }).toBe(true);
  await expect(tenti(page)).toHaveCount(3);
  await expect(page.locator('canvas[data-tenti]')).toHaveCount(0);
  for (const t of await tenti(page).all()) {
    await expect(t.locator('svg[data-tenti-svg]')).toHaveCount(1);
    const [caja, dibujo] = await Promise.all([t.boundingBox(), t.locator('svg').boundingBox()]);
    // El SVG ocupa la caja del icono, ni un píxel movido.
    expect(Math.abs(caja!.x - dibujo!.x)).toBeLessThan(0.6);
    expect(Math.abs(caja!.y - dibujo!.y)).toBeLessThan(0.6);
    expect(Math.abs(caja!.width - dibujo!.width)).toBeLessThan(0.6);
  }
});
