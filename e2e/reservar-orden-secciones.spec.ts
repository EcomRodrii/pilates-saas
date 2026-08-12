import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El orden que el estudio elige en el editor, cumplido por la PÁGINA.
//
// Este fichero existe por un fallo concreto: el rail del editor ya dejaba
// arrastrar y ocultar (#944) y la página solo miraba la visibilidad de la banda
// de cifras — portada, horario y pie estaban clavados en el JSX. Se podía
// arrastrar una sección, guardar, y no pasaba absolutamente nada.
//
// La portada acabó ANCLADA al arreglarlo, no movible: comparte un único
// degradado con la barra de marca y las pestañas, y separarla para poder
// moverla dejaba costuras a la vista. Se puede ocultar, que es lo que se pide
// de verdad. Los dos casos tienen su test aquí abajo.
//
// ⚠️ Se comprueba por POSICIÓN EN PANTALLA (`boundingBox().y`), nunca por orden
// del DOM: se reordena con `order` de CSS, así que el DOM no se mueve y un test
// que mirase el DOM daría verde con la página pintada al revés.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const S = 'studio-test';

function fixture(extra: Record<string, unknown> = {}) {
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [], salas: [], instructores: [], spots: [], planesTarifa: [], sesiones: [],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
    ...extra,
  };
}

async function montar(page: Page, reservar: unknown = null, extra: Record<string, unknown> = {}) {
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture({ reservar, ...extra })) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  await page.goto(`/reservar/${SLUG}`);
}

/** Dónde cae en pantalla, de verdad. */
async function alturaDe(page: Page, quien: 'portada' | 'horario' | 'pie') {
  const loc = quien === 'portada' ? page.locator('h1')
    : quien === 'horario' ? page.locator('#horario')
    : page.getByRole('button', { name: 'Política de privacidad' });
  const caja = await loc.first().boundingBox();
  if (!caja) throw new Error(`sin caja para ${quien}`);
  return caja.y;
}

test('sin nada guardado, el orden es el de siempre: portada, horario, pie', async ({ page }) => {
  await montar(page);
  // Timeout explícito en la primera aserción tras el goto: con `next dev` esta
  // ruta se compila bajo demanda y se pasa de los 5 s por defecto.
  await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });
  const [portada, horario, pie] = await Promise.all([
    alturaDe(page, 'portada'), alturaDe(page, 'horario'), alturaDe(page, 'pie'),
  ]);
  expect(portada).toBeLessThan(horario);
  expect(horario).toBeLessThan(pie);
});

test('un orden guardado se cumple en pantalla: el pie sube por encima de las cifras', async ({ page }) => {
  // `['contacto', 'cifras']` resuelve a [portada, horario, contacto, cifras]:
  // portada y horario están ANCLADAS y se quedan en su hueco del catálogo; las
  // movibles rellenan el resto en el orden elegido. Ver secciones.test.ts.
  //
  // No hay clases sembradas, así que la banda de cifras no se pinta (no lo
  // MERECE, que es otra regla) — se comprueba con el pie, que sí está: sigue
  // detrás del horario, y eso confirma que un orden guardado no descoloca lo
  // que va anclado.
  await montar(page, { orden: ['contacto', 'cifras'], ocultos: [] });
  await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });
  const [portada, horario, pie] = await Promise.all([
    alturaDe(page, 'portada'), alturaDe(page, 'horario'), alturaDe(page, 'pie'),
  ]);
  expect(portada).toBeLessThan(horario);
  expect(horario).toBeLessThan(pie);
});

test('⚠️ la portada NO se mueve aunque el orden guardado lo pida', async ({ page }) => {
  // Comparte el degradado del hero con la barra y las pestañas; separarla deja
  // costuras a la vista en la página de todos los estudios. Está anclada, y el
  // rail tampoco la deja arrastrar — esto es la segunda puerta.
  await montar(page, { orden: ['contacto', 'portada'], ocultos: [] });
  await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });
  const [portada, horario] = await Promise.all([
    alturaDe(page, 'portada'), alturaDe(page, 'horario'),
  ]);
  expect(portada).toBeLessThan(horario);
});

test('⚠️ anclada no es obligatoria: la portada se oculta y desaparece', async ({ page }) => {
  await montar(page, { orden: [], ocultos: ['portada'] });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('h1')).toHaveCount(0);
  // Y lo que NO se oculta con ella: la barra de marca sigue arriba del todo.
  await expect(page.getByText('Estudio Alma').first()).toBeVisible();
});

test('ocultar el contacto se lleva los enlaces legales', async ({ page }) => {
  await montar(page, { orden: [], ocultos: ['contacto'] });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Política de privacidad' })).toHaveCount(0);
});

test('⚠️ el horario se pinta aunque alguien lo haya metido en `ocultos`', async ({ page }) => {
  // Puede llegar ahí a mano o de una versión anterior. Una página de reservas
  // sin horario está rota, así que la regla vive también aquí, no solo en el
  // editor — que es UI y nunca es el límite.
  await montar(page, { orden: [], ocultos: ['horario', 'portada', 'contacto', 'cifras'] });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
});

// ── «Sobre nosotros» ────────────────────────────────────────────────────────
// La única sección cuyo contenido escribe el estudio entero. La regla que la
// define no es de orden sino de existencia: sin texto no hay sección, y no hay
// texto por defecto. Un «Sobre nosotros» de fábrica sería una mentira sobre el
// estudio, a diferencia de un titular genérico, que solo se lee como una
// página sin terminar.

test('sin texto escrito, «Sobre nosotros» no existe en la página', async ({ page }) => {
  await montar(page);
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toHaveCount(0);
});

test('el título solo NO basta para que la sección aparezca', async ({ page }) => {
  // Un encabezado sobre nada es peor que nada, así que manda el texto.
  await montar(page, null, { reservarSobreTitulo: 'Quiénes somos' });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toHaveCount(0);
});

test('con texto se ve, respetando los saltos de línea', async ({ page }) => {
  await montar(page, null, {
    reservarSobreTitulo: 'Quiénes somos',
    reservarSobreTexto: 'Somos tres.\nY llevamos ocho años.',
  });
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Somos tres.')).toBeVisible();
  // `pre-line`: los saltos que escribe la propietaria se respetan tal cual, sin
  // parsear Markdown ni abrir la puerta a inyectar HTML.
  const ws = await page.getByText('Somos tres.').evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(ws).toBe('pre-line');
});

test('se puede ocultar aunque esté escrito', async ({ page }) => {
  await montar(page, { orden: [], ocultos: ['sobre'] }, {
    reservarSobreTitulo: 'Quiénes somos', reservarSobreTexto: 'Somos tres.',
  });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toHaveCount(0);
});
