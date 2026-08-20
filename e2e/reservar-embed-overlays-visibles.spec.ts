import { test, expect, type Page } from '@playwright/test';
import { scriptSnippetIframe } from '../lib/reservar/snippet-embed.ts';

// ─────────────────────────────────────────────────────────────────────────────
// P0-3 (mobile UX del checkout embebido) — los overlays del Modo A se ven
// DONDE MIRA EL USUARIO, no al fondo del iframe.
//
// El problema, MEDIDO en producción con la página anfitriona real: el iframe
// se auto-dimensiona a TODO su contenido (2299px), así que un overlay con
// `inset: 0` se ancla al iframe entero — el modal «Tus datos» apareció en
// top:1536 de 2299, junto al pie de la web del estudio, a ~1000px de donde
// miraba el usuario. Literalmente «el siguiente paso queda abajo» (queja del
// fundador).
//
// Aquí se monta una página anfitriona DE VERDAD (iframe + snippet, servida en
// otro origen) y se mide con boundingBox — que en Playwright viene siempre en
// coordenadas del viewport del host, justo lo que ve el usuario:
//   1. Snippet NUEVO (el mismo código que genera tab-api.tsx, vía
//      lib/reservar/snippet-embed): hoja y modal caen DENTRO de la franja
//      visible, con el CTA a la vista sin scroll.
//   2. Snippet VIEJO (solo auto-resize, el ya pegado en webs que no se
//      actualizan solas): fallback — overlay anclado al TOP del iframe, nunca
//      al fondo.
//   3. Sin iframe (página completa, móvil 390×844): el CTA de la hoja es un
//      footer sticky visible AL ABRIR (antes nacía en top:894 con viewport de
//      844), con el título de la clase también a la vista.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

// Chromium moderno bloquea que una página enmarque un iframe hacia la red
// local (Local Network Access, `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`)
// — en producción no aplica (todo es público, https), pero aquí el servidor
// bajo test ES localhost. Se desactiva solo el check, solo en este spec.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

const SLUG = 'tentare';
const S = 'studio-test';
const PORT = process.env.E2E_PORT ?? '3000';
const APP = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// Otro PUERTO de localhost, no un dominio inventado: Chromium bloquea que un
// origen «público» (p. ej. http://anfitrion.test) enmarque un recurso de red
// local (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) — localhost→localhost no
// dispara ese check y sigue siendo CROSS-ORIGIN (puerto distinto), que es lo
// que importa para que la validación de `e.origin` del snippet trabaje de
// verdad. No hay ningún servidor en este puerto: page.route lo sirve.
const HOST = 'http://localhost:4499';
const IFRAME_ID = `tentare-widget-${SLUG}-reservas`;

function fx() {
  const mk = (h: string, id: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-12T${h}:00:00`, fin: `2026-08-12T${h}:50:00`, aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [],
    sesiones: [mk('10', 's1'), mk('18', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [],
    citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

// El snippet VIEJO, tal cual se generaba antes de P0-3: solo auto-resize, sin
// origin-check, sin viewport, sin scrollTo. Es lo que sigue pegado en las webs
// de estudios existentes — el widget tiene que funcionar con él.
function scriptViejo() {
  return `<script>window.addEventListener('message',function(e){if(e.data&&e.data.tentareEmbedAltura&&e.data.tentareSlug==='${SLUG}'){var f=document.getElementById('${IFRAME_ID}');if(f)f.style.height=e.data.tentareEmbedAltura+'px';}});</script>`;
}

async function montarHost(page: Page, snippet: 'nuevo' | 'viejo') {
  const script = snippet === 'nuevo'
    ? scriptSnippetIframe({ origen: APP, slug: SLUG, iframeId: IFRAME_ID })
    : scriptViejo();
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:sans-serif">
<div id="cabecera-host" style="height:700px;background:#eee">La web del estudio</div>
<iframe id="${IFRAME_ID}" src="${APP}/reservar/${SLUG}?embed=1&tab=clases" style="width:100%;height:600px;border:0" title="Reservas"></iframe>
${script}
<div style="height:1400px;background:#ddd">Pie de la web del estudio</div>
</body></html>`;
  await page.route(`${HOST}/`, r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${HOST}/`);
  const frame = page.frameLocator(`#${IFRAME_ID}`);
  await frame.locator('#horario').waitFor({ timeout: 150_000 });
  // Espera al auto-resize: el iframe crece de los 600px iniciales al contenido
  // real (bastante más de 1000px con dos clases + «cómo funciona» + pie).
  await expect
    .poll(async () => (await page.locator(`#${IFRAME_ID}`).boundingBox())!.height, { timeout: 30_000 })
    .toBeGreaterThan(1000);
  return frame;
}

test('snippet NUEVO: la hoja de clase y el modal caen dentro de lo que el usuario ve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  const frame = await montarHost(page, 'nuevo');

  // La visitante scrollea la web del estudio hasta ver la tarjeta de la clase.
  const tarjeta = frame.getByRole('button', { name: /Reformer a las 10:00/ });
  await tarjeta.scrollIntoViewIfNeeded();
  // Deja que el snippet informe del viewport tras el scroll (rAF + postMessage).
  await page.waitForTimeout(400);
  await tarjeta.click();

  const hoja = frame.locator('div[role=dialog] > div').first();
  await expect(hoja).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400); // recolocación si llegó franja tras abrir

  // La hoja ENTERA dentro del viewport real del host (390×844) — no al fondo
  // del iframe de 1000+px.
  const caja = (await hoja.boundingBox())!;
  expect(caja.y).toBeGreaterThanOrEqual(-2);
  expect(caja.y + caja.height).toBeLessThanOrEqual(846);

  // CTA visible SIN scroll (footer sticky) y el título de la clase también:
  // se ve qué se reserva y cómo seguir, a la vez. Acotados al dialog — fuera
  // de él, las tarjetas del listado también dicen «Reservar ahora».
  const dialogo = frame.locator('div[role=dialog]');
  const cta = dialogo.getByRole('button', { name: /^Reservar/ });
  await expect(cta).toBeInViewport();
  await expect(dialogo.getByRole('heading', { name: /Reformer/i })).toBeInViewport();

  // Siguiente paso: sin sesión, el CTA abre el modal de acceso (PublicSheet).
  // También tiene que aparecer donde mira el usuario.
  await cta.click();
  const modal = frame.getByRole('dialog', { name: 'Entra para reservar' });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  const cajaModal = (await modal.boundingBox())!;
  expect(cajaModal.y).toBeGreaterThanOrEqual(-2);
  expect(cajaModal.y + cajaModal.height).toBeLessThanOrEqual(846);
});

test('snippet VIEJO (solo auto-resize): fallback — overlay al TOP del iframe, nunca al fondo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  const frame = await montarHost(page, 'viejo');

  const tarjeta = frame.getByRole('button', { name: /Reformer a las 10:00/ });
  await tarjeta.scrollIntoViewIfNeeded();
  await tarjeta.click();

  const hoja = frame.locator('div[role=dialog] > div').first();
  await expect(hoja).toBeVisible({ timeout: 30_000 });
  // Deja terminar la animación de entrada (translateY 16px, .28s): medir a
  // mitad de animación daba la hoja unos px por debajo de su sitio final.
  await page.waitForTimeout(500);

  const iframeBox = (await page.locator(`#${IFRAME_ID}`).boundingBox())!;
  const caja = (await hoja.boundingBox())!;
  // Anclada al top del iframe (paddingTop 16 del backdrop), con tolerancia.
  expect(Math.abs(caja.y - (iframeBox.y + 16))).toBeLessThanOrEqual(6);
  // Y acotada (min(88vh,640) — nunca una hoja de 2000px que obligue a buscar
  // el CTA): el comportamiento viejo la dejaba pegada al FONDO del iframe.
  expect(caja.height).toBeLessThanOrEqual(642);
  const fondoIframe = iframeBox.y + iframeBox.height;
  expect(caja.y + caja.height).toBeLessThan(fondoIframe - 100);
});

test('sin iframe (móvil 390×844): el CTA es visible AL ABRIR la hoja, sin scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await page.goto(`${APP}/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

  // Antes: el CTA nacía en top:894 con viewport de 844 (scroller interno de
  // 916px) — había que scrollear para ENCONTRAR el botón de reservar.
  const dialogo = page.locator('div[role=dialog]');
  const cta = dialogo.getByRole('button', { name: /^Reservar/ });
  await expect(cta).toBeInViewport();
  const cajaCta = (await cta.boundingBox())!;
  expect(cajaCta.y + cajaCta.height).toBeLessThanOrEqual(846);
  // Y sigue viéndose QUÉ clase se reserva mientras tanto.
  await expect(dialogo.getByRole('heading', { name: /Reformer/i })).toBeInViewport();
  // La hoja sigue siendo el panel a todo el ancho de siempre (mismo criterio
  // que reservar-escritorio-no-es-movil-estirado.spec.ts).
  const hoja = (await page.locator('div[role=dialog] > div').first().boundingBox())!;
  expect(hoja.width).toBe(390);
});
