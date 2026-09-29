import { test, expect, type Page } from '@playwright/test';
import { firmaDeUrl } from '../lib/widgets/firma-contenido.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Tentare Widgets»: las vistas del motor que añadió el catálogo
// (lib/widgets/catalogo.ts), verificadas sobre la página pública REAL en modo
// incrustado — la misma URL que genera el constructor:
//   - `tab=planes` (+ `planes=BONO`): «Planes y precios» / «Bonos y packs»
//   - `tab=equipo`: «Instructoras»
//   - `cuenta=completa`: «Mi cuenta» con sus dos caras
// y que ninguna se cuela fuera del modo incrustado ni arrastra las secciones
// de la página completa (1 widget = 1 propósito).
//
// Mismo andamiaje de mocks que e2e/widget-config-params.spec.ts.
//
// Y, al final, lo que manda la página de la Fase C del constructor: dónde está
// pegada y con qué versión (lib/reservar/pegado-widget.ts), solo dentro de la
// web del estudio y solo en `widget_loaded`.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

// Chromium bloquea que una web pública enmarque la red local (Local Network
// Access, `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`), y el servidor bajo
// test ES localhost: sin esto, el iframe de la anfitriona de la Fase C no
// cargaría. En producción no aplica (todo es público). Mismo arreglo que
// reservar-embed-overlays-visibles.spec.ts; es de lanzamiento, así que va para
// todo el fichero (no se puede acotar a un `describe`).
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

const SLUG = 'tentare';
const S = 'studio-test';

function fx() {
  const mk = (d: string, h: string, id: string) => ({ id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: `2026-08-${d}T${h}:00:00+02:00`, fin: `2026-08-${d}T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false });
  return {
    studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null, duracionMinutos: 50 }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [
      { id: 'ins-1', studioId: S, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR', activo: true },
      { id: 'ins-2', studioId: S, nombre: 'Bea Gil', rol: 'INSTRUCTOR', activo: false },
    ],
    spots: [],
    planesTarifa: [
      { id: 'p-cuota', studioId: S, tipo: 'MENSUAL', activo: true, precio: 89, nombre: 'Cuota Reformer', periodicidadMeses: 1 },
      { id: 'p-bono', studioId: S, tipo: 'BONO', activo: true, precio: 100, nombre: 'Bono 10 clases', sesiones: 10 },
    ],
    sustitucionesConfirmadas: [],
    sesiones: [mk('12', '10', 's1'), mk('13', '10', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

/** Lo que manda la página al embudo (lib/reservar/eventos.ts), tal cual. */
type Evento = { tipo: string; origen: string | null; forma?: unknown; anfitrion?: unknown; firma?: unknown };
/** Las tres claves de la Fase C: dónde está pegado y con qué versión. */
const lleva = (e: Evento) => 'forma' in e || 'anfitrion' in e || 'firma' in e;

async function montar(page: Page) {
  await page.setViewportSize({ width: 1100, height: 760 });
  // Con su zona, igual que las clases del fixture: sin ella lo interpretaría el
  // navegador, y en CI (UTC) serían otras horas.
  await page.clock.install({ time: new Date('2026-08-12T08:00:00+02:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  // Contador de eventos del embudo: la vista previa del panel no debe contar.
  // El cuerpo entero, no solo tipo y origen: la Fase C mira qué claves lleva.
  const eventos: Evento[] = [];
  await page.route('**/api/public/evento**', r => {
    eventos.push(r.request().postDataJSON() as Evento);
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  return { eventos };
}

async function abrir(page: Page, query: string) {
  const { eventos } = await montar(page);
  await page.goto(`/reservar/${SLUG}?${query}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  return { eventos };
}

test('«Planes y precios»: solo los planes, con su pago, y nada del horario', async ({ page }) => {
  await abrir(page, 'embed=1&tab=planes&ref=web-planes');
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toHaveCount(1);
  await expect(page.getByText('Cuota Reformer')).toBeVisible();
  await expect(page.getByText('Bono 10 clases')).toBeVisible();
  await expect(page.getByRole('button', { name: /Contratar/ })).toHaveCount(2);
  // Ni el horario ni las secciones de la página completa.
  await expect(page.locator('.reserva-slot-row')).toHaveCount(0);
  await expect(page.locator('#bonos-membresias')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
});

test('«Bonos y packs»: `planes=BONO` deja solo los bonos', async ({ page }) => {
  await abrir(page, 'embed=1&tab=planes&planes=BONO');
  await expect(page.getByText('Bono 10 clases')).toBeVisible();
  await expect(page.getByText('Cuota Reformer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Contratar/ })).toHaveCount(1);
});

test('«Instructoras»: el equipo que da clase, y nada más', async ({ page }) => {
  await abrir(page, 'embed=1&tab=equipo');
  await expect(page.getByRole('heading', { name: 'Nuestro equipo' })).toBeVisible();
  // Bea está de baja: no sale (`queImparten`, el mismo criterio que «El estudio»).
  await expect(page.getByText('Ana Ruiz')).toBeVisible();
  await expect(page.getByText('Bea Gil')).toHaveCount(0);
  await expect(page.locator('.reserva-slot-row')).toHaveCount(0);
});

test('«Mi cuenta»: `cuenta=completa` enseña sus dos pestañas y se pasa de una a otra', async ({ page }) => {
  await abrir(page, 'embed=1&tab=misreservas&cuenta=completa');
  const pestanas = page.locator('#horario').getByRole('button');
  await expect(pestanas.filter({ hasText: 'Mis reservas' })).toHaveCount(1);
  await expect(pestanas.filter({ hasText: 'Mi cuenta' })).toHaveCount(1);
  await expect(pestanas.filter({ hasText: 'Clases' })).toHaveCount(0);
  await pestanas.filter({ hasText: 'Mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Identifícate para ver tu cuenta' })).toBeVisible();
});

test('⚠️ sin `cuenta=completa`, «Mis reservas» sigue siendo de un solo propósito', async ({ page }) => {
  await abrir(page, 'embed=1&tab=misreservas');
  await expect(page.locator('#horario').getByRole('button').filter({ hasText: 'Mi cuenta' })).toHaveCount(0);
});

test('⚠️ fuera del modo incrustado, `tab=planes` no existe: cae al horario de siempre', async ({ page }) => {
  await abrir(page, 'tab=planes&planes=BONO');
  await expect(page.locator('.reserva-slot-row').first()).toBeVisible({ timeout: 30_000 });
  // Y los planes siguen en su sección, sin filtrar.
  await expect(page.locator('#bonos-membresias')).toContainText('Cuota Reformer');
});

test('la etiqueta `ref` viaja en los eventos, y la vista previa del panel no cuenta', async ({ page }) => {
  const { eventos } = await abrir(page, 'embed=1&tab=clases&ref=web-horario');
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_loaded').length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(eventos.every(e => e.origen === 'web-horario'), JSON.stringify(eventos)).toBe(true);
  // Fase C: a pantalla completa (sin marco) no es un widget pegado en su web,
  // así que la carga no dice de dónde viene ni con qué versión.
  expect(eventos.some(lleva), JSON.stringify(eventos)).toBe(false);
});

test('⚠️ `vista-previa=1` (el constructor del panel) no manda ningún evento', async ({ page }) => {
  const { eventos } = await abrir(page, 'embed=1&tab=clases&ref=web-horario&vista-previa=1');
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  // Margen para que cualquier evento de carga hubiera salido ya.
  await page.waitForTimeout(1500);
  expect(eventos).toEqual([]);
});

// ── Fase C: dónde se ve lo pegado ────────────────────────────────────────────
//
// La web de una anfitriona de verdad, en `http` a propósito (una web del
// estudio en http es su web, y de https a http el navegador no manda
// referrer), con el iframe TAL CUAL lo copia el constructor: sin ningún
// parámetro nuevo. Se abre con una ruta y una `utm` que no deben salir de ahí.

const ANFITRIONA = 'http://albapilates.example.com';
const CODIGO = 'embed=1&tab=clases&ref=web-horario';

async function enSuWeb(page: Page, app: string, query: string) {
  const { eventos } = await montar(page);
  // Después del andamiaje: registrada antes, alguna ruta de `montar` podría taparla.
  await page.route(`${ANFITRIONA}/**`, r => r.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body style="margin:0">
<p>Horarios de Alba Pilates</p>
<iframe id="w" src="${app}/reservar/${SLUG}?${query}" style="width:100%;height:700px;border:0" title="Reservas"></iframe>
</body></html>`,
  }));
  await page.goto(`${ANFITRIONA}/horarios?utm_source=x`);
  await page.frameLocator('#w').locator('#horario').waitFor({ timeout: 150_000 });
  return { eventos };
}

test('dentro de su web, `widget_loaded` dice dónde (solo el origen) y con qué versión; el resto del embudo, nada', async ({ page, baseURL }) => {
  const { eventos } = await enSuWeb(page, baseURL!, CODIGO);
  // Primero, que ha salido algo: sin esto, las negativas de abajo pasarían sin mirar nada.
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_loaded').length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_viewed').length, { timeout: 15_000 }).toBeGreaterThan(0);

  for (const carga of eventos.filter(e => e.tipo === 'widget_loaded')) {
    expect(carga).toMatchObject({
      origen: 'web-horario',
      forma: 'incrustado',
      anfitrion: ANFITRIONA,
      // La misma cuenta que hace el panel sobre el código que genera.
      firma: firmaDeUrl(new URLSearchParams(CODIGO)),
    });
  }
  // Solo en la carga: la sesión del embudo acaba llevando el id de la socia.
  const resto = eventos.filter(e => e.tipo !== 'widget_loaded');
  expect(resto.some(lleva), JSON.stringify(resto)).toBe(false);
  // Nunca la ruta ni la query de su web.
  expect(JSON.stringify(eventos)).not.toContain('/horarios');
  expect(JSON.stringify(eventos)).not.toContain('utm_source');
});

// Fase D: `directo=1` solo lo pone la redirección de la integración nativa
// (app/widget-bundle/main.tsx), que ya contó la visita en la web del estudio,
// y SIEMPRE a pantalla completa. Ahí no se vuelve a contar: ni `widget_loaded`
// ni `widget_viewed`. El resto del embudo sí, con la misma etiqueta, que es lo
// que dice si ese widget convierte. Dentro de un marco (`embed=1`) no es ella,
// y la visita cuenta como cualquier otra.
//
// Lo que no cambia con ningún parámetro que pone la propia Tentare
// (`PARAMS_DE_EJECUCION`, lib/reservar/pegado-widget.ts): esa URL no es el
// código de su web, así que la carga no dice dónde ni con qué versión. El
// control es que `widget_loaded` SÍ sale: sin él, «no lleva nada» pasaría sin
// mirar nada.

test('⚠️ `directo=1` dentro de su web no es la redirección de la nativa: cuenta la visita, pero sin decir dónde', async ({ page, baseURL }) => {
  const { eventos } = await enSuWeb(page, baseURL!, `${CODIGO}&directo=1`);
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_loaded').length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(eventos.some(lleva), JSON.stringify(eventos)).toBe(false);
});

test('⚠️ con otro parámetro que pone la propia Tentare (`clase=`), dentro de su web: cuenta la visita, sin decir dónde ni con qué versión', async ({ page, baseURL }) => {
  const { eventos } = await enSuWeb(page, baseURL!, `${CODIGO}&clase=s1`);
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_loaded').length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(eventos.some(lleva), JSON.stringify(eventos)).toBe(false);
});

test('⚠️ a pantalla completa, con la URL real de la redirección de la nativa: el embudo sigue, con su etiqueta, sin contar otra visita', async ({ page }) => {
  // Tal cual la escribe `irAPaginaDeTentare` (app/widget-bundle/main.tsx).
  const { eventos } = await abrir(page, 'sesion=s1&directo=1&ref=web-horario');
  await expect.poll(() => eventos.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(eventos.some(e => e.tipo === 'widget_loaded' || e.tipo === 'widget_viewed'), JSON.stringify(eventos)).toBe(false);
  expect(eventos.every(e => e.origen === 'web-horario'), JSON.stringify(eventos)).toBe(true);
});
