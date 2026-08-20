import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Que la tipografía elegida llegue A TODO el widget, no solo a la raíz.
//
// ⚠️ Este spec existe porque los que ya había medían `getComputedStyle` sobre
// el div raíz —y ahí la fuente SÍ llegaba— mientras el widget de verdad se veía
// en Instrument Sans. El motivo: casi nada hereda. El calendario, la rejilla,
// los botones y los titulares declaran su propia `font-family` leyendo
// `var(--font-ui)` / `var(--font-display)`, y en Modo A esas variables las
// definía el layout de Next dentro del iframe, no el widget. O sea que el test
// verde y la pantalla rota decían cosas distintas y ganaba el test.
//
// Por eso aquí NO se mide la raíz: se mide el sitio donde el estudio lo nota.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare'; const S = 'studio-test';

function fx() {
  const mk = (d: string, h: string, id: string) => ({ id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false });
  return { studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sesiones: [mk('12', '10', 's1'), mk('12', '18', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null };
}

async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function abrir(page: Page, q: string) {
  await page.goto(`/reservar/${SLUG}?embed=1&tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);
}

test('la fuente elegida llega al calendario, no solo al div de fuera', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await abrir(page, '&fuente=Playfair+Display');

  // El contenedor del calendario declara su propia familia vía var(--font-ui):
  // es exactamente el nodo que antes se quedaba en Instrument Sans.
  const enCalendario = await page.evaluate(() => {
    const cal = document.querySelector('#horario');
    return cal ? getComputedStyle(cal).fontFamily : null;
  });
  expect(enCalendario).toContain('Playfair Display');

  // Y la variable está puesta en la raíz, que es lo que lo hace posible.
  const varUi = await page.evaluate(() => {
    const raiz = document.querySelector('#horario')!.closest('div[style*="min-height"]') as HTMLElement;
    return getComputedStyle(raiz).getPropertyValue('--font-ui').trim();
  });
  expect(varUi).toContain('Playfair Display');
});

test('la fuente de titulares llega por --font-display, no solo por --portal-heading-font', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await abrir(page, '&fuente=Inter&fuente-display=Fraunces');

  const vars = await page.evaluate(() => {
    const raiz = document.querySelector('#horario')!.closest('div[style*="min-height"]') as HTMLElement;
    const cs = getComputedStyle(raiz);
    return {
      display: cs.getPropertyValue('--font-display').trim(),
      heading: cs.getPropertyValue('--portal-heading-font').trim(),
      ui: cs.getPropertyValue('--font-ui').trim(),
    };
  });
  // Las 8 clases `font-[var(--font-display),…]` de los modales leen la primera;
  // la segunda la usan los tokens `serif`. Hacen falta las dos.
  expect(vars.display).toContain('Fraunces');
  expect(vars.heading).toContain('Fraunces');
  expect(vars.ui).toContain('Inter');
});

test('⚠️ la rejilla compacta también: tenía la fuente del sistema escrita a fuego', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  // `diseno=ligero` es el que trae el bundle por defecto — o sea, el caso más
  // común del widget embebido, y el único que no cambiaba nunca de tipografía.
  await abrir(page, '&fuente=Poppins&diseno=ligero');

  const familias = await page.evaluate(() => {
    const raiz = document.querySelector('#horario')!;
    // Cualquier nodo de la rejilla que declare familia propia.
    return [...raiz.querySelectorAll<HTMLElement>('div,button')]
      .map(e => getComputedStyle(e).fontFamily)
      .filter(f => f.includes('Segoe UI') || f.includes('Poppins'));
  });
  expect(familias.length).toBeGreaterThan(0);
  // Ni uno solo puede quedarse en la pila del sistema sin la elegida delante.
  for (const f of familias) expect(f).toContain('Poppins');
});

test('sin tocar nada, no se emite ninguna fuente (el widget de siempre)', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await abrir(page, '');

  const r = await page.evaluate(() => {
    const raiz = document.querySelector('#horario')!.closest('div[style*="min-height"]') as HTMLElement;
    const estilo = raiz.getAttribute('style') ?? '';
    return {
      // La raíz no debe DECLARAR las variables si nadie eligió fuente: se
      // heredan del layout, que es el comportamiento de siempre.
      //
      // ⚠️ Se busca `--font-ui:` con dos puntos, no `--font-ui` a secas: sin
      // fuente elegida la raíz escribe `font-family: var(--font-ui), …`, que
      // contiene el nombre de la variable sin declararla. Buscar la subcadena
      // suelta daba un rojo que era del test, no del código.
      declaraUi: /--font-ui\s*:/.test(estilo),
      declaraDisplay: /--font-display\s*:/.test(estilo),
      linkGoogle: !!document.querySelector('link[href*="fonts.googleapis"]'),
    };
  });
  expect(r.declaraUi).toBe(false);
  expect(r.declaraDisplay).toBe(false);
  expect(r.linkGoogle).toBe(false);
});
