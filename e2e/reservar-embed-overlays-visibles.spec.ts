import { test, expect, type Page } from '@playwright/test';
import { scriptSnippetIframe } from '../lib/reservar/snippet-embed.ts';

// ─────────────────────────────────────────────────────────────────────────────
// P0-3 (mobile UX del checkout embebido) — los overlays del Modo A se ven
// DONDE MIRA EL USUARIO, no al fondo del iframe.
//
// ⚠️ Actualizado en el rediseño "sin popup" (docs/rediseno-widget-sin-popup-diseno.md):
// la ficha de la clase y el flujo de login/datos/pago DEJARON de ser un
// `role="dialog"` flotante anclado con `franjaVisible` — ahora son contenido
// normal de la página, que sustituye al listado en el sitio de siempre. Esto
// no es solo un cambio de assertions: es una simplificación real. Antes había
// que anclar un overlay dentro de un iframe auto-dimensionado (con o sin
// información de franja visible, snippet nuevo vs viejo); ahora no hay ningún
// overlay que anclar — la ficha es simplemente lo que hay en la página, y
// `window.scrollTo(0, 0)` (BookingSheet, modo 'vista') la deja siempre al
// principio del documento DEL IFRAME. Eso hace que la distinción
// snippet-nuevo/snippet-viejo para la POSICIÓN de la ficha ya no exista: las
// dos se comportan igual por dentro del iframe. Lo único que el snippet
// nuevo sigue aportando es que el `tentareScrollTo` (aún emitido, ver
// `overlayEmbebidoAbierto` en app/reservar/[slug]/page.tsx) trae la VENTANA
// DEL HOST hasta el iframe — el snippet viejo lo ignora (nunca lo entendió)
// y el iframe puede quedar fuera de la vista del host, pero su CONTENIDO
// interno sigue siendo correcto y alcanzable con un scroll normal.
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

test('snippet NUEVO: tras un tap en la tarjeta, la pantalla siguiente cae dentro de lo que el usuario ve', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  const frame = await montarHost(page, 'nuevo');

  // La visitante scrollea la web del estudio hasta ver la tarjeta de la clase.
  const tarjeta = frame.getByRole('button', { name: /Reformer a las 10:00/ });
  await tarjeta.scrollIntoViewIfNeeded();
  // Deja que el snippet informe del viewport tras el scroll (rAF + postMessage).
  await page.waitForTimeout(400);
  await tarjeta.click();

  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): una invitada sin sesión ya no pasa por la ficha
  // de detalle — un tap en la tarjeta lleva DIRECTO al flujo de acceso
  // ("Entra para reservar"), que tiene que aparecer donde mira el usuario
  // igual que antes lo hacía la ficha.
  const tituloAcceso = frame.getByText('Entra para reservar');
  await expect(tituloAcceso).toBeVisible({ timeout: 30_000 });
  // El snippet nuevo trae la ventana del HOST hasta el iframe (`tentareScrollTo`,
  // aún emitido — ver el docblock de arriba) tras el resize. `expect.poll` en
  // vez de un `waitForTimeout` fijo: el resize + scrollTo son dos mensajes
  // async encadenados y el tiempo real varía con la carga de la máquina.
  //
  // Margen amplio de tolerancia (viewport ±150px), no viewport exacto: el
  // objetivo real de este test es "sin hunting", no "centrado al píxel" — el
  // propio mecanismo de scroll del host (`scrollIntoView`) no promete un
  // encaje perfecto, solo que el elemento quede razonablemente a la vista.
  await expect.poll(async () => (await tituloAcceso.boundingBox())!.y, { timeout: 5000 }).toBeGreaterThanOrEqual(-150);
  const cajaAcceso = (await tituloAcceso.boundingBox())!;
  expect(cajaAcceso.y).toBeLessThanOrEqual(994);
});

test('snippet VIEJO (solo auto-resize): la pantalla de acceso sigue siendo correcta DENTRO del iframe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  const frame = await montarHost(page, 'viejo');

  const tarjeta = frame.getByRole('button', { name: /Reformer a las 10:00/ });
  await tarjeta.scrollIntoViewIfNeeded();
  await tarjeta.click();

  // El snippet viejo no entiende `tentareScrollTo` — no puede traer la
  // ventana del HOST hasta el iframe. Pero, igual que ya pasaba con la
  // ficha, la pantalla de acceso NO es un overlay: es contenido normal que
  // siempre nace al principio del documento DEL IFRAME (`window.scrollTo(0,
  // 0)`) — así que, aunque el host no la traiga a la vista sola, sigue
  // siendo alcanzable con un scroll normal de la propia página del host,
  // nunca "perdida" 1000px más abajo.
  const tituloAcceso = frame.getByText('Entra para reservar');
  await expect(tituloAcceso).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  const iframeBox = (await page.locator(`#${IFRAME_ID}`).boundingBox())!;
  const cajaAcceso = (await tituloAcceso.boundingBox())!;
  // El título nace bien dentro de la PRIMERA MITAD del documento del iframe
  // — nunca a mitad ni al fondo, que es justo el defecto que este spec
  // protege (antes, un overlay mal anclado podía caer a ~1000px de lo que el
  // usuario veía). No se compara contra un número de píxeles fijo: la altura
  // real del documento depende del contenido, así que lo que importa es la
  // proporción, no una cifra adivinada.
  expect(cajaAcceso.y - iframeBox.y).toBeLessThanOrEqual(iframeBox.height / 2);

  // El CTA de la pantalla de acceso es alcanzable haciendo scroll DENTRO del
  // iframe (su propio documento, `window.scrollTo` ya lo dejó al principio)
  // — no hace falta que el host se mueva para que sea usable.
  const cta = frame.getByRole('button', { name: /Continuar →/ });
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
});

test('sin iframe (móvil 390×844): el CTA es visible AL ABRIR el acceso, sin scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mocks(page);
  await page.goto(`${APP}/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();

  // Petición explícita del fundador (2026-08-30): una invitada sin sesión
  // ya no pasa por la ficha de detalle — un tap en la tarjeta lleva DIRECTO
  // al flujo de acceso. Sin `role="dialog"` (rediseño "sin popup"): es la
  // página misma, no un diálogo flotante encima del listado (que además
  // está oculto mientras está abierta).
  await expect(page.getByRole('heading', { name: /entra para reservar/i })).toBeVisible({ timeout: 30_000 });

  // El CTA nace cerca de la parte alta del contenido — no hace falta
  // scrollear para siquiera VER que existe.
  const cta = page.getByRole('button', { name: /Continuar →/ });
  await expect(cta).toBeVisible();
  // La pantalla ocupa (casi) todo el ancho del viewport (390px), sin el
  // margen lateral grande de una tarjeta modal centrada — el bloque en modo
  // `inline` solo resta su propio padding horizontal.
  const ancho = await page.getByRole('heading', { name: /entra para reservar/i }).evaluate(
    el => el.closest('[style*="flex-direction"]')?.getBoundingClientRect().width ?? document.body.clientWidth,
  );
  expect(ancho).toBeGreaterThan(330);
});
