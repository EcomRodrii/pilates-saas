import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// F3 del rediseño de /reservar (29-sep-2026): la cabecera y la portada de la
// página SUELTA, al estilo de la app de la alumna.
//
// Lo medible que pidió el fundador: al abrir /reservar/<slug> se ve el
// principio del horario —la tira de días y el arranque de la primera clase—
// sin hacer scroll, a 1280×800 y a 390×844. Antes, en escritorio, la portada
// se comía los ~620 px de arriba y la primera clase empezaba bajo el pliegue.
//
// Con los dos estudios sembrados en el servidor (lib/studio-seo.ts): `tentare`
// (la apariencia de siempre) y `tentare-carbon` (Carbón + Editorial: otra
// pareja tipográfica, otros tamaños de letra, y oscuro).
//
// Andamiaje de e2e/reservar-tema-de-la-app.spec.ts, con las horas con su zona
// explícita (+02:00) para que no dependan del reloj del runner.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';

function fx(slug: string) {
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

type Tamano = { width: number; height: number };
const ESCRITORIO: Tamano = { width: 1280, height: 800 };
const MOVIL: Tamano = { width: 390, height: 844 };

async function abrir(page: Page, slug: string, tamano: Tamano, q = '') {
  await page.setViewportSize(tamano);
  await mocks(page, slug);
  await page.goto(`/reservar/${slug}?tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  // Las tarjetas entran subiendo 12 px (`reserva-card-in`, .35 s): se miden quietas.
  await page.waitForTimeout(900);
}

// ── El objetivo medible ─────────────────────────────────────────────────────

for (const slug of ['tentare', 'tentare-carbon']) {
  for (const [nombre, tamano] of [['escritorio', ESCRITORIO], ['móvil', MOVIL]] as const) {
    test(`${slug}, ${nombre} (${tamano.width}×${tamano.height}): la tira de días y la primera clase asoman sin hacer scroll`, async ({ page }) => {
      await abrir(page, slug, tamano);
      // Sin trampa: la página está arriba del todo y la portada está puesta.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('.reservar-portada h1')).toBeVisible();

      const tira = await page.getByRole('tablist', { name: 'Elegir día' }).boundingBox();
      const fila = await page.locator('.reserva-slot-row').first().boundingBox();
      expect(tira, 'no hay tira de días').not.toBeNull();
      expect(fila, 'no hay primera clase').not.toBeNull();
      // La tira, entera dentro de la primera pantalla.
      expect(tira!.y + tira!.height).toBeLessThanOrEqual(tamano.height);
      // De la primera clase, al menos el arranque: su hora y su nombre (40 px).
      expect(fila!.y + 40, `la primera clase empieza en y=${Math.round(fila!.y)}`).toBeLessThanOrEqual(tamano.height);

      // Y nada se sale por el lado.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(tamano.width);
    });
  }
}

// ── Al bajar por el horario ─────────────────────────────────────────────────

test('móvil: al bajar por el horario, la tira de días y los filtros se quedan arriba', async ({ page }) => {
  // El bloque se diseñó pegado («todo pegado al borde superior al hacer
  // scroll», components/reserva/reserva-calendario.tsx), pero la raíz de
  // /reservar llevaba `overflow: hidden` y no se pegaba nunca.
  await abrir(page, 'tentare', MOVIL);
  const tira = page.getByRole('tablist', { name: 'Elegir día' });
  const inicio = await tira.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(y => window.scrollTo(0, y), inicio + 120);
  await page.waitForTimeout(300);
  const caja = (await tira.boundingBox())!;
  expect(caja.y, `la tira está en y=${Math.round(caja.y)}`).toBeGreaterThanOrEqual(-1);
  expect(caja.y).toBeLessThan(80);
});

// ── La cabecera ─────────────────────────────────────────────────────────────

test('móvil: la cabecera va en UNA fila, y «Mis reservas» y el teléfono pasan al menú', async ({ page }) => {
  await abrir(page, 'tentare', MOVIL);
  const cabecera = page.getByRole('banner');
  const nombre = (await cabecera.getByText('Estudio Alma', { exact: true }).boundingBox())!;
  const acceder = (await cabecera.getByRole('button', { name: 'Acceder' }).boundingBox())!;
  const menu = (await cabecera.getByRole('button', { name: 'Más secciones' }).boundingBox())!;
  // Una fila: los dos botones se cruzan en vertical con el nombre, y caben.
  // Antes «Mis reservas» se partía en dos líneas y «Acceder» bajaba a otra fila.
  for (const b of [acceder, menu]) {
    expect(b.y).toBeLessThan(nombre.y + nombre.height);
    expect(b.y + b.height).toBeGreaterThan(nombre.y);
    expect(b.x + b.width).toBeLessThanOrEqual(MOVIL.width);
  }
  await expect(cabecera.getByRole('button', { name: 'Mis reservas' })).toBeHidden();

  await cabecera.getByRole('button', { name: 'Más secciones' }).click();
  const desplegable = page.getByRole('menu', { name: 'Más secciones' });
  await expect(desplegable.getByRole('menuitem', { name: 'Mis reservas' })).toBeVisible();
  await expect(desplegable.getByRole('menuitem', { name: 'El estudio' })).toBeVisible();
  await expect(desplegable.getByRole('menuitem', { name: /Llamar al \+34 600 111 222/ })).toHaveAttribute('href', 'tel:+34600111222');

  // Teclado: Escape cierra y devuelve el foco al botón.
  await page.keyboard.press('Escape');
  await expect(desplegable).toBeHidden();
  await expect(cabecera.getByRole('button', { name: 'Más secciones' })).toBeFocused();
});

test('escritorio: «Mis reservas» en la barra, el horario en su columna y el titular alineado con él', async ({ page }) => {
  await abrir(page, 'tentare', ESCRITORIO);
  const cabecera = page.getByRole('banner');
  await expect(cabecera.getByRole('button', { name: 'Mis reservas' })).toBeVisible();

  // La columna contenida (~720 px, decisión del fundador), centrada.
  const fila = (await page.locator('.reserva-slot-row').first().boundingBox())!;
  expect(fila.width).toBeLessThanOrEqual(720);
  expect(Math.abs(fila.x + fila.width / 2 - ESCRITORIO.width / 2)).toBeLessThan(4);
  // El titular de la portada empieza en el mismo borde que el horario.
  const titular = (await page.locator('.reservar-portada h1').boundingBox())!;
  expect(Math.abs(titular.x - fila.x)).toBeLessThan(2);

  // En escritorio el menú no repite «Mis reservas»: ya está en la barra.
  await cabecera.getByRole('button', { name: 'Más secciones' }).click();
  const desplegable = page.getByRole('menu', { name: 'Más secciones' });
  await expect(desplegable.getByRole('menuitem', { name: 'El estudio' })).toBeVisible();
  await expect(desplegable.getByRole('menuitem', { name: 'Mis reservas' })).toBeHidden();
});

test('teclado: el primer Tab es «Saltar al horario», y deja el foco en el contenido', async ({ page }) => {
  await abrir(page, 'tentare', ESCRITORIO);
  await page.keyboard.press('Tab');
  const saltar = page.getByRole('link', { name: 'Saltar al horario' });
  await expect(saltar).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

// ── El widget incrustado no cambia ──────────────────────────────────────────

test('⚠️ incrustada (embed=1) nada de esto existe: ni cabecera, ni portada, ni columna', async ({ page }) => {
  await abrir(page, 'tentare', ESCRITORIO, '&embed=1');
  await expect(page.locator('.reservar-portada')).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Saltar al horario' })).toHaveCount(0);
  // Su ancho lo decide la web del estudio: la fila sigue a todo el recuadro.
  const fila = (await page.locator('.reserva-slot-row').first().boundingBox())!;
  expect(fila.width).toBeGreaterThan(720);
});
