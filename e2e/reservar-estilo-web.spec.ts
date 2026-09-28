import { test, expect, type Page } from '@playwright/test';
import { WIDGET_WEB_NEUTRO, borradorAParam } from '../lib/reservar/estilo-web-tipos';

// ─────────────────────────────────────────────────────────────────────────────
// El estilo de los widgets en la web del estudio (Fase B del constructor,
// 28-sep-2026): la dueña lo aplica UNA vez desde el panel y cambia solo en
// todos sus widgets pegados, sin volver a pegar ningún código. Aquí, lo que ve
// la visitante de su web: /reservar dentro de un iframe (`embed=1`).
//
// ⚠️ El estilo publicado se resuelve en el SERVIDOR (el layout lo pasa por el
// proveedor), así que `page.route` no llega: el estudio de prueba lo lleva por
// SLUG (lib/studio-seo.ts), igual que `tentare-carbon` lleva el de la app:
//   · `tentare-web-arena`: Arena, letra Editorial (Libre Caslon · Figtree) y
//     botones «Oscuros» (la tinta de Arena, #2A241F), sobre una app por defecto.
//   · `tentare-web-fundido`: nada más que «se funde con una web oscura».
//   · `tentare`: nada publicado, que tiene que ser exactamente F1.
//
// Las fuentes se comparan con una SONDA (un elemento con
// `font-family: var(--font-figtree)`), no con un nombre escrito aquí: mismo
// motivo que e2e/reservar-tema-de-la-app.spec.ts, del que sale el andamiaje.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';

function fx(slug: string) {
  // Con su zona explícita: sin ella, el navegador la lee en la hora de SU
  // máquina y el test en la del runner.
  const mk = (h: string, id: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-12T${h}:00:00+02:00`, fin: `2026-08-12T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sesiones: [mk('10', 's1'), mk('18', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [],
    challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function mocks(page: Page, slug: string) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx(slug)) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function abrir(page: Page, slug: string, q: string) {
  await page.setViewportSize({ width: 1000, height: 620 });
  await mocks(page, slug);
  await page.goto(`/reservar/${slug}?tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);
}

async function medir(page: Page) {
  return page.evaluate(() => {
    // La raíz de la página es la que lleva `min-height: 100dvh` en línea (ver
    // el mismo comentario en e2e/reservar-tema-de-la-app.spec.ts).
    const raiz = document.querySelector('#horario')!.closest('div[style*="100dvh"]') as HTMLElement;
    const primera = (f: string) => f.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    const sonda = (pila: string) => {
      const el = document.createElement('span');
      el.style.fontFamily = pila;
      document.body.appendChild(el);
      const f = getComputedStyle(el).fontFamily;
      el.remove();
      return primera(f);
    };
    const titular = document.querySelector('[style*="var(--portal-heading-font"]') as HTMLElement | null;
    const cs = getComputedStyle(raiz);
    return {
      fondo: cs.backgroundColor,
      tinta: cs.color,
      cuerpo: primera(cs.fontFamily),
      titularPrimera: titular ? primera(getComputedStyle(titular).fontFamily) : null,
      jakarta: sonda('var(--font-jakarta)'),
      figtree: sonda('var(--font-figtree)'),
      caslon: sonda('var(--font-libre-caslon)'),
      marcaRaiz: cs.getPropertyValue('--portal-brand').trim(),
      estiloRaiz: raiz.getAttribute('style') ?? '',
      body: getComputedStyle(document.body).backgroundColor,
      esquema: getComputedStyle(document.documentElement).colorScheme,
      // El `<style>` del documento del iframe (`cssDocumentoIncrustado`).
      documento: Array.from(document.querySelectorAll('style')).map(s => s.textContent ?? '').find(t => t.startsWith('html,body{')) ?? null,
    };
  });
}

/** Los `style="…"` de la respuesta del servidor, tal cual, sin JavaScript de por medio. */
async function estilosDelServidor(page: Page, ruta: string) {
  const res = await page.request.get(ruta);
  expect(res.status(), ruta).toBe(200);
  const html = await res.text();
  const estilos = [...html.matchAll(/\sstyle="([^"]*)"/g)]
    .map(m => m[1].replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  return { html, estilos };
}

const claro = (rgb: string) => { const [r, g, b] = rgb.match(/\d+/g)!.map(Number); return (r + g + b) / 3; };
const CREMA = 'rgb(250, 249, 245)';

test('⚠️ sin destello: el HTML del SERVIDOR ya trae el estilo de su web (colores, letra y botones), y la página suelta no', async ({ page }) => {
  // El servidor solo emite el esqueleto previo al montaje: si el estilo no va
  // en él, el primer fotograma dentro de la web del estudio es el de la app y
  // salta al suyo al hidratar.
  const incrustada = await estilosDelServidor(page, '/reservar/tentare-web-arena?embed=1&tab=clases');
  const raiz = incrustada.estilos.find(s => /--portal-bg:\s*#F4EEE5/i.test(s));
  expect(raiz, `ningún style del servidor lleva el fondo de Arena:\n${incrustada.estilos.join('\n')}`).toBeTruthy();
  expect(raiz).toMatch(/--portal-heading-font:\s*var\(--font-libre-caslon\)/);
  expect(raiz).toMatch(/--font-ui:\s*var\(--font-figtree\)/);
  // «Oscuros»: la tinta de Arena en `--portal-brand`.
  expect(raiz).toMatch(/--portal-brand:\s*#2A241F/i);
  // Y el documento del iframe, con el fondo de su estilo (no el de `:root`).
  expect(incrustada.html).toContain('html,body{background:#F4EEE5 !important;}');

  // La página suelta del MISMO estudio es de Tentare: el estilo de su web no le llega.
  const suelta = await estilosDelServidor(page, '/reservar/tentare-web-arena?tab=clases');
  expect(suelta.estilos.filter(s => /#F4EEE5|--font-libre-caslon/i.test(s))).toEqual([]);
  expect(suelta.html).not.toContain('html,body{background:');

  // Sin nada publicado, el servidor emite lo de F1: nada en línea.
  const f1 = await estilosDelServidor(page, '/reservar/tentare?embed=1&tab=clases');
  expect(f1.estilos.filter(s => /--portal-bg:|--font-ui:|--portal-heading-font:/.test(s))).toEqual([]);
  expect(f1.html).toContain('html,body{background:var(--portal-bg) !important;}');
});

test('incrustada, con el estilo de su web: fondo de Arena, Figtree, titulares en Libre Caslon y botones en su tinta', async ({ page }) => {
  await abrir(page, 'tentare-web-arena', '&embed=1');
  const r = await medir(page);
  expect(r.fondo).toBe('rgb(244, 238, 229)');
  expect(r.cuerpo).toBe(r.figtree);
  expect(r.titularPrimera).toBe(r.caslon);
  expect(r.marcaRaiz.toUpperCase()).toBe('#2A241F');
  // Los colores que viajan por PROP (las tarjetas de clase) también son los de
  // Arena: su tarjeta tostada, no la blanca del día de siempre.
  await expect(page.locator('.reserva-slot-row', { hasText: 'Reformer' }).first()).toHaveCSS('background-color', 'rgb(255, 252, 247)');
});

test('la página suelta del mismo estudio sigue siendo la de la app: el estilo de su web es solo para dentro de su web', async ({ page }) => {
  await abrir(page, 'tentare-web-arena', '');
  const r = await medir(page);
  expect(r.fondo).toBe(CREMA);
  expect(r.cuerpo).toBe(r.jakarta);
  expect(r.estiloRaiz).not.toMatch(/--portal-bg\s*:/);
  expect(r.estiloRaiz).not.toContain('--font-libre-caslon');
});

test('⚠️ un código con diseño propio no recibe el estilo de su web, ni siquiera en parte', async ({ page }) => {
  // Es lo que promete el panel al aplicarlo: «los widgets con un diseño propio
  // dentro de su código no cambian».
  await abrir(page, 'tentare-web-arena', '&embed=1&fondo=%23ffffff');
  const conFondo = await medir(page);
  expect(conFondo.fondo).toBe('rgb(255, 255, 255)');
  expect(conFondo.cuerpo).toBe(conFondo.jakarta);
  expect(conFondo.estiloRaiz).not.toContain('--font-libre-caslon');
  expect(conFondo.estiloRaiz.toUpperCase()).not.toContain('#F4EEE5');

  // Con solo `marca=` (que sobre una app clara no decide la paleta), eje por
  // eje heredaría los neutros de Arena. Tiene que quedarse la app entera, con
  // su marca encima.
  await abrir(page, 'tentare-web-arena', '&embed=1&marca=%23E11D48');
  const conMarca = await medir(page);
  expect(conMarca.fondo).toBe(CREMA);
  expect(conMarca.cuerpo).toBe(conMarca.jakarta);
  expect(conMarca.estiloRaiz).not.toMatch(/--portal-bg\s*:/);
  expect(conMarca.estiloRaiz).not.toContain('--font-libre-caslon');
  expect(conMarca.marcaRaiz.toUpperCase()).toBe('#E11D48');
});

test('⚠️ fundido, la raíz y el documento son transparentes; en la ventana que se abre encima, opacos', async ({ page }) => {
  await abrir(page, 'tentare-web-fundido', '&embed=1');
  const fundido = await medir(page);
  expect(fundido.fondo).toBe('rgba(0, 0, 0, 0)');
  expect(fundido.body).toBe('rgba(0, 0, 0, 0)');
  // La raíz del documento en `normal`: si no, lienzo opaco dentro del iframe.
  expect(fundido.esquema).toBe('normal');
  expect(fundido.documento).toBe('html,body{background:transparent !important;}:root:root{color-scheme:normal;}');
  // Sobre una web oscura, letra clara (la app es Crema: pasa a Carbón).
  expect(claro(fundido.tinta)).toBeGreaterThan(200);

  // El popup la abre con `ventana=1` (lib/widgets/popup-url.ts): su marco es
  // blanco fijo, y letra clara sobre él no se leería. Va en su recuadro.
  await abrir(page, 'tentare-web-fundido', '&embed=1&ventana=1');
  const ventana = await medir(page);
  expect(ventana.fondo).toBe(CREMA);
  expect(ventana.body).toBe(CREMA);
  expect(claro(ventana.tinta)).toBeLessThan(80);
});

test('el borrador de la vista previa del panel solo cuenta con `vista-previa=1`, y sustituye a lo publicado', async ({ page }) => {
  const carbon = encodeURIComponent(borradorAParam({ ...WIDGET_WEB_NEUTRO, estilo: 'carbon' }));
  await abrir(page, 'tentare', `&embed=1&vista-previa=1&borrador-web=${carbon}`);
  expect((await medir(page)).fondo).toBe('rgb(23, 24, 27)');

  // Sin `vista-previa=1` se ignora: nadie cambia el widget de un estudio con un enlace.
  await abrir(page, 'tentare', `&embed=1&borrador-web=${carbon}`);
  const ignorado = await medir(page);
  expect(ignorado.fondo).toBe(CREMA);
  expect(ignorado.estiloRaiz).not.toMatch(/--portal-bg\s*:/);

  // «Nada elegido» también es un borrador: enseña la app, no lo publicado.
  const nada = encodeURIComponent(borradorAParam({ ...WIDGET_WEB_NEUTRO }));
  await abrir(page, 'tentare-web-arena', `&embed=1&vista-previa=1&borrador-web=${nada}`);
  const vacio = await medir(page);
  expect(vacio.fondo).toBe(CREMA);
  expect(vacio.cuerpo).toBe(vacio.jakarta);
});

test('sin nada publicado, el widget es exactamente el de F1: nada en línea y el documento de siempre', async ({ page }) => {
  await abrir(page, 'tentare', '&embed=1');
  const r = await medir(page);
  expect(r.fondo).toBe(CREMA);
  expect(r.cuerpo).toBe(r.jakarta);
  expect(r.estiloRaiz).not.toMatch(/--portal-bg\s*:/);
  expect(r.estiloRaiz).not.toMatch(/--font-ui\s*:/);
  expect(r.estiloRaiz).not.toMatch(/--portal-heading-font\s*:/);
  expect(r.documento).toBe('html,body{background:var(--portal-bg) !important;}');
});
