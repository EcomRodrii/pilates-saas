import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Que el widget se pueda ACOPLAR a la web del estudio.
//
// El problema medido: incrustado llevaba su propio decorado y no había forma de
// quitarlo — fondo `#F6F7F9` opaco (una losa casi blanca sobre una web oscura),
// tipografía fija, el pie con la dirección y los legales que la web anfitriona
// ya tiene, y las cuatro pestañas aunque se incrustara solo el horario.
//
// ⚠️ Se comprueba con `getComputedStyle` sobre la RAÍZ del widget, no sobre
// `body > div`: entre medias hay envoltorios de proveedores sin estilo propio, y
// medir ahí daba «transparente» en los dos casos — o sea, un test que habría
// pasado en verde sin que nada funcionara.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare'; const S = 'studio-test';
function fx() {
  const mk = (d: string, h: string, id: string) => ({ id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false });
  return { studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sesiones: [mk('12','10','s1'), mk('12','18','s2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null };
}
async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function medir(page: Page, q: string) {
  await page.goto(`/reservar/${SLUG}?embed=1&tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    // La raíz del widget es la que CONTIENE #horario y lleva estilo en línea:
    // entre `body` y ella hay envoltorios de proveedores sin estilo propio.
    const raiz = document.querySelector('#horario')!.closest('div[style*="min-height"]') as HTMLElement;
    const cs = getComputedStyle(raiz);
    return {
      fondo: cs.backgroundColor,
      tinta: cs.color,
      fuente: cs.fontFamily,
      linkFuente: !!document.querySelector('link[href*="fonts.googleapis"]'),
      pestanas: document.querySelectorAll('#horario button').length,
      hayPie: !!document.querySelector('footer'),
    };
  });
}


test('sin parámetros, el widget sigue exactamente como estaba', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const r = await medir(page, '');
  expect(r.fondo).not.toBe('rgba(0, 0, 0, 0)');
  expect(r.linkFuente).toBe(false);
  expect(r.pestanas).toBe(4);
  expect(r.hayPie).toBe(true);
});

test('⚠️ fondo transparente: se ve el de la web anfitriona', async ({ page }) => {
  // El problema gordo. Un fondo opaco es una losa; transparente deja pasar el
  // de su web, sea claro u oscuro, sin que tengamos que adivinarlo.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const r = await medir(page, '&fondo=transparente');
  expect(r.fondo).toBe('rgba(0, 0, 0, 0)');
});

test('la tipografía se NOMBRA y se carga de verdad', async ({ page }) => {
  // Un iframe no puede heredar la fuente de la web anfitriona —son documentos
  // distintos—, así que el estudio la nombra y la cargamos nosotros.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const r = await medir(page, '&fuente=Space%20Grotesk');
  expect(r.fuente).toContain('Space Grotesk');
  expect(r.linkFuente).toBe(true);
});

test('sin pie y con una sola pestaña', async ({ page }) => {
  // Quien incrusta «Horario y reserva de clases» no espera que su visitante se
  // vaya a «El estudio» dentro de un recuadro de su propia web. Y el pie con la
  // dirección y los legales ya lo tiene su web.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const r = await medir(page, '&pie=0&solo-pestana=1');
  expect(r.pestanas).toBe(1);
  expect(r.hayPie).toBe(false);
});

test('⚠️ la página SUELTA no cambia, aunque le pases los parámetros', async ({ page }) => {
  // Sin `embed=1` no se aplica nada: `/reservar/<slug>` es la página de Tentare
  // y ahí es el único sitio donde viven los legales.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?fondo=transparente&pie=0&solo-pestana=1`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await expect(page.locator('footer')).toBeVisible();
  await expect(page.locator('#horario button')).toHaveCount(4);
});

// ── Color del texto ─────────────────────────────────────────────────────────
// ⚠️ Este bloque existe por un hallazgo de la VISTA PREVIA, no de un diseño
// previo: con el fondo transparente sobre una web oscura, el texto del widget
// seguía siendo oscuro y no se leía. La previa lo enseñó el primer día.

test('⚠️ con `texto=claro` la letra se aclara de verdad', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const oscuro = await medir(page, '');
  const claro = await medir(page, '&fondo=transparente&texto=claro');
  // No se compara contra un hex concreto: lo que importa es que CAMBIE y que
  // acabe siendo claro. Fijar el valor ataría el test a la paleta de noche.
  expect(claro.tinta).not.toBe(oscuro.tinta);
  const [r, g, b] = claro.tinta.match(/\d+/g)!.map(Number);
  expect((r + g + b) / 3).toBeGreaterThan(150);
});

test('⚠️ `auto` sobre transparente NO adivina: se queda oscuro', async ({ page }) => {
  // Un iframe no ve el documento que lo contiene. Adivinar dejaría ilegible a
  // quien tenga la web oscura, sin avisar — el panel empuja a elegir.
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  const base = await medir(page, '');
  const auto = await medir(page, '&fondo=transparente&texto=auto');
  expect(auto.tinta).toBe(base.tinta);
});

test('⚠️ con `texto=claro` NINGUNA superficie se queda clara', async ({ page }) => {
  // El complemento del test de arriba, y el que de verdad hacía falta: aclarar
  // la TINTA no basta si el panel de debajo sigue blanco — sale letra clara
  // sobre fondo claro, que es peor que no haber tocado nada.
  //
  // Se comprueba barriendo el DOM en vez de mirando un elemento concreto,
  // porque el color entraba por tres canales distintos y cada arreglo puntual
  // dejaba vivo el siguiente: blancos translúcidos escritos a mano, `RT` fijado
  // a `MODO_TOKENS.dia` a nivel de módulo, y el calendario, que no lee
  // variables CSS sino que recibe los tokens por prop (`t=`). Antes del
  // arreglo este barrido devolvía 4; un cuarto canal futuro lo devolvería a
  // subir sin que ningún test por elemento se enterase.
  await page.setViewportSize({ width: 1000, height: 620 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?embed=1&fondo=transparente&texto=claro`);
  await page.locator('#horario').waitFor();

  const claras = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || Number(s.opacity) === 0) continue;
      const caja = el.getBoundingClientRect();
      // Se ignora lo diminuto: un punto de 6 px no es una superficie, y un
      // borde claro sobre fondo oscuro es legítimo.
      if (caja.width < 40 || caja.height < 20) continue;
      const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s.backgroundColor);
      if (!m) continue;
      const alfa = m[4] === undefined ? 1 : Number(m[4]);
      if (alfa > 0.3 && Number(m[1]) > 200 && Number(m[2]) > 200 && Number(m[3]) > 200) {
        out.push(`${s.backgroundColor} :: ${(el.getAttribute('style') ?? '').slice(0, 80)}`);
      }
    }
    return out;
  });

  expect(claras, `superficies claras sobre web oscura:\n${claras.join('\n')}`).toEqual([]);
});
