import { test, expect, type Page } from '@playwright/test';
import { resolveBloquesPantalla } from '../lib/portal-home-bloques.ts';

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
//
// ⚠️ La página lee `bloquesReservar` YA RESUELTO (Fase 2 del Theme Builder,
// fetchPublicStudioData) — no vuelve a interpretar `orden`/`ocultos` por su
// cuenta. Este mock aquí sustituye a `fetchPublicStudioData` entero, así que
// tiene que hacer ÉL la misma resolución que haría el servidor de verdad
// (`resolveBloquesPantalla`, la MISMA función, no una reimplementada) — si no,
// pasar `orden`/`ocultos` al mock no movería nada y estos tests certificarían
// un contrato que la app real ya no cumple.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const S = 'studio-test';

// Dos contratables y uno a 0 €, que NO debe ofrecerse en público (F0 · POR-1:
// cualquiera obtendría clases gratis).
const PLANES = [
  { id: 'p1', nombre: 'Bono 5 clases', tipo: 'BONO', precio: 75, sesiones: 5, activo: true, descripcion: null },
  { id: 'p2', nombre: 'Mensual ilimitado', tipo: 'MENSUAL', precio: 89, sesiones: null, activo: true, descripcion: null },
  { id: 'p0', nombre: 'Plan interno gratis', tipo: 'BONO', precio: 0, sesiones: 3, activo: true, descripcion: null },
];

function fixture(extra: Record<string, unknown> = {}) {
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [], salas: [], instructores: [], spots: [], planesTarifa: PLANES, sesiones: [],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
    ...extra,
  };
}

async function montar(page: Page, reservar: unknown = null, extra: Record<string, unknown> = {}) {
  // Mismo cálculo que el servidor (getLayout → resolveLayout →
  // resolveBloquesPantalla), reutilizando la función real: si `bloques.reservar`
  // no está guardado (el caso de todos los tests de aquí abajo), sintetiza
  // desde `orden`/`ocultos`, igual que en producción.
  const bloquesReservar = resolveBloquesPantalla(
    null, 'reservar', undefined,
    (reservar ?? undefined) as { orden?: string[]; ocultos?: string[] } | undefined,
  ).publicado;
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture({ reservar, bloquesReservar, ...extra })) }));
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

// ── Bonos y membresías ──────────────────────────────────────────────────────
// Vivían DENTRO de la pestaña «El estudio», entre los tipos de clase y las
// instructoras. Lo que más cuesta vender era lo que peor se veía: escondido
// tras un clic, en la pestaña que menos se abre.

test('los bonos se ven en la página, sin abrir ninguna pestaña', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Bono 5 clases')).toBeVisible();
  await expect(page.getByText('Mensual ilimitado')).toBeVisible();
});

test('⚠️ un plan a 0 € sigue sin ofrecerse en público', async ({ page }) => {
  // La regla no se movió con el bloque: sacarla de sitio es justo cuando se
  // pierden estas cosas, y aquí regalaría clases a cualquiera.
  await montar(page);
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Plan interno gratis')).toHaveCount(0);
});

test('la pestaña «El estudio» ya no los lleva: no se duplican', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'El estudio' }).click();
  // Uno, y solo uno, esté la pestaña que esté: si el bloque se hubiera copiado
  // en vez de movido, aquí saldrían dos «Contratar» por plan.
  await expect(page.getByRole('button', { name: 'Contratar' })).toHaveCount(2);
  await expect(page.getByText('NUESTROS PLANES')).toHaveCount(0);
});

test('sin ningún plan contratable, la sección no existe', async ({ page }) => {
  // Una banda «Bonos y membresías» vacía en la página pública es peor que no
  // tenerla — mismo criterio que «Sobre nosotros».
  await montar(page, null, { planesTarifa: [] });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toHaveCount(0);
});

test('se pueden ocultar desde el editor', async ({ page }) => {
  await montar(page, { orden: [], ocultos: ['bonos'] });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toHaveCount(0);
});

// ── Los siete textos de VOZ ─────────────────────────────────────────────────
// El P1 de «i18n por atributo» de la auditoría de Momence, resuelto como VOZ y
// no como idioma: ver la nota de `lib/theme-schema.ts`.
//
// ⚠️ Lo que se comprueba aquí es que el texto llega HASTA LA PANTALLA. Los
// campos ya existían a medias en este repo (el esquema y el editor tenían
// `reservarTitular` mucho antes de que la página lo pintara), así que un test
// sobre el esquema habría dado verde con la página ignorándolo. Es el mismo
// fallo del rail que arrastraba sin que la página se moviera.

test('los textos propios del estudio sustituyen a los de fábrica', async ({ page }) => {
  await montar(page, null, {
    reservarAvisoQuiz: '¿Vienes por primera vez? Te acompañamos.',
    reservarComoFunciona: 'ASÍ FUNCIONA',
    reservarAyuda: '¿Te ayudamos? Escríbenos:',
  });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('¿Vienes por primera vez? Te acompañamos.')).toBeVisible();
  await expect(page.getByText('ASÍ FUNCIONA')).toBeVisible();
  await expect(page.getByText('¿Te ayudamos? Escríbenos:')).toBeVisible();
  // Y el de fábrica ya no está: si conviviesen, se vería dos veces.
  await expect(page.getByText('¿Primera vez en el estudio?', { exact: false })).toHaveCount(0);
});

test('⚠️ sin escribir nada se sigue viendo el texto de fábrica', async ({ page }) => {
  // El caso que de verdad protege a los estudios que ya existen: vacío NO puede
  // dejar un hueco en blanco. Es lo contrario de «Sobre nosotros», donde vacío
  // sí significa «no pintes la sección».
  await montar(page);
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('¿Primera vez en el estudio?', { exact: false })).toBeVisible();
  await expect(page.getByText('CÓMO FUNCIONA', { exact: true })).toBeVisible();
});

// ── Bloques del catálogo (Fase 2 del Theme Builder) ─────────────────────────
// La pieza que cierra el ciclo: un bloque añadido desde el editor (banner/
// texto/cta/…) tiene que APARECER en la página real, con el render propio de
// /reservar (components/reservar/bloque-reservar-render.tsx) — no el del
// portal, y no silenciosamente ausente.

test('un bloque de texto añadido desde el editor se pinta en la página, con el lenguaje visual de /reservar', async ({ page }) => {
  const base = resolveBloquesPantalla(null, 'reservar').publicado;
  const bloquesReservar = [
    ...base,
    { id: 'b-texto-1', kind: 'texto', config: { titulo: 'Nuestros servicios', texto: 'Reformer, mat y clases privadas.' } },
  ];
  await montar(page, null, { bloquesReservar });
  // El título del bloque es un `<div>` con estilo de titular, no un `<h*>`
  // semántico — mismo patrón que su equivalente del portal
  // (components/portal/bloque-home-render.tsx). `getByText`, no
  // `getByRole('heading')`.
  await expect(page.getByText('Nuestros servicios', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Reformer, mat y clases privadas.')).toBeVisible();
});

test('un bloque oculto no se pinta', async ({ page }) => {
  const base = resolveBloquesPantalla(null, 'reservar').publicado;
  const bloquesReservar = [
    ...base,
    { id: 'b-texto-2', kind: 'texto', config: { titulo: 'Aviso oculto', texto: 'x' }, oculto: true },
  ];
  await montar(page, null, { bloquesReservar });
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Aviso oculto', { exact: true })).toHaveCount(0);
});

test('un bloque de texto vacío (incompleto) tampoco se pinta', async ({ page }) => {
  const base = resolveBloquesPantalla(null, 'reservar').publicado;
  const bloquesReservar = [...base, { id: 'b-texto-3', kind: 'texto', config: { titulo: '', texto: '' } }];
  await montar(page, null, { bloquesReservar });
  // Mismo gate que Inicio/Clases/Bonos (bloqueEstaCompleto): sin título ni
  // cuerpo, no cuenta como sección — la página sigue en pie, sin un hueco.
  await expect(page.locator('#horario')).toBeVisible({ timeout: 30_000 });
});
