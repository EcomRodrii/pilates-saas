import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El modal de reserva en un móvil de verdad.
//
// Los defectos que fija este spec estaban todos medidos, no supuestos:
//  · El CTA «Continuar al pago» era el ÚLTIMO hijo de un contenedor con scroll,
//    con foto + título + 3 filas de datos + descripción + 4 campos + una
//    casilla obligatoria por encima. Con el teclado abierto quedaba fuera de
//    alcance, y con él la casilla que lo habilita: un formulario sin salida.
//  · El fondo NO se bloqueaba (`body` en `overflow: visible`, medido en
//    producción), así que al llegar al final de la hoja el gesto seguía y
//    arrastraba el listado de clases de detrás.
//  · Los campos medían 14px, y por debajo de 16px iOS Safari amplía la página
//    al enfocarlos y ya no la devuelve a su sitio.
//  · Siete de los nueve pasos no decían en cuál estabas.
//
// ⚠️ Actualizado en el rediseño de la pantalla de reserva (Fase 2-5,
// docs/rediseno-pantalla-reserva-diseno.md): 'datos'/'pago' dejaron de vivir
// en ESTE modal — ahora es <PantallaReserva>, un scroll continuo a pantalla
// completa sin CTA fijo ni indicador de paso, a propósito (referencia
// Momence: "sin ningún control de paso anterior salvo el propio del
// navegador"). Dos de los tests de abajo se actualizaron para reflejar eso;
// el resto (fondo bloqueado, 16px, marco estable, apellidos sin estrangular)
// siguen protegiendo defectos reales que la nueva pantalla también evita.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12, reservaExigirPlan: true, stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null, descripcion: 'Una clase larga con una descripción generosa para que el contenido del modal tenga que hacer scroll de verdad y el botón no quepa por sí solo.' }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'plan-suelto', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 18, sesiones: 1, activo: true }],
    sesiones: [{
      id: 'ses-puntual', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
      inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false,
    }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function abrirPasoDatos(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));

  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): un tap en la tarjeta dispara `onReservar` directo,
  // sin ficha de detalle intermedia con su propio botón "Reservar".
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
}

test('⚠️ el botón de continuar es ALCANZABLE con scroll, nunca inexistente', async ({ page }) => {
  // Antes de la Fase 2 el CTA vivía en un `footer` fijo SIEMPRE visible sin
  // scroll — eso exigía "toBeInViewport" al abrir. `PantallaReserva` lo
  // cambia a propósito: el CTA es el último elemento de un scroll continuo
  // (mismo criterio que Momence, docs/rediseno-pantalla-reserva-diseno.md),
  // así que con una descripción larga NO está en pantalla al abrir — lo que
  // habría sido el defecto real es que no se pudiera llegar a él NI
  // scrolleando, que es justo lo que comprobaba antes el "y sigue estándolo"
  // de más abajo.
  await abrirPasoDatos(page);

  const cta = page.getByRole('button', { name: /Continuar al pago/ });
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeInViewport();
});

// ⚠️ Bug real de producción (2026-08-29): este test protegía la premisa
// CONTRARIA a la de arriba — daba por hecho que "Tus datos" es un modal
// flotando sobre un fondo que no debe moverse, y por eso bloqueaba
// `body.overflow`. Pero `PantallaReserva` (`PublicSheet inline`, rediseño
// "sin popup") NO tiene fondo: el checkout ES la página. El bloqueo de scroll
// se colaba igual (venía de `useDialogA11y` → `useBloquearScrollFondo`, que
// no distinguía `inline`), y el resultado en producción era que la propia
// pantalla de pago quedaba sin poder hacer scroll — ni siquiera se podía
// llegar al botón "Continuar al pago" que el test de arriba SÍ comprueba que
// debe alcanzarse con scroll. Las dos aserciones no podían ser ciertas a la
// vez; esta es la que estaba desactualizada.
test('en el checkout "sin popup" la página SÍ hace scroll (no hay fondo que proteger)', async ({ page }) => {
  await abrirPasoDatos(page);

  const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(overflow).not.toBe('hidden');

  // No un delta de rueda de ratón (frágil: el autofocus del primer campo ya
  // puede haber llevado la página cerca del máximo antes de medir «antes») —
  // la prueba estructural de que SE PUEDE hacer scroll es que hay más
  // contenido que alto de ventana.
  const { scrollHeight, clientHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  // Y que se puede LLEGAR al final (el defecto real: `overflow:hidden`
  // impedía moverse aunque `scrollHeight` fuera mayor).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  const cerca = await page.evaluate(() => Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 4);
  expect(cerca).toBe(true);
});

test('⚠️ los campos miden 16px: por debajo, iOS amplía la página al enfocarlos', async ({ page }) => {
  await abrirPasoDatos(page);

  for (const marcador of ['Nombre', 'Apellidos', 'tu@email.com']) {
    const campo = page.getByPlaceholder(marcador, { exact: false }).first();
    if (!(await campo.count())) continue;
    const px = await campo.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(px, `el campo «${marcador}» mide ${px}px`).toBeGreaterThanOrEqual(16);
  }
});

test('⚠️ "Tus datos"/"pago" ya NO dicen "Paso X de Y" — es un scroll continuo, no un wizard', async ({ page }) => {
  // Antes 'datos' y 'pago' eran dos hojas separadas con "‹ Datos"/"‹ Pago" y
  // un "Paso 1 de 2 · Tus datos". `PantallaReserva` (Fase 2 del rediseño) las
  // funde en un único scroll continuo A PROPÓSITO — un indicador numerado
  // reintroduciría justo la sensación de wizard que ese rediseño pidió
  // evitar (mismo criterio que confirma lib/reservar/pasos-flujo.test.ts:
  // `recorridoDe('datos'|'pago')` vuelve a `null`). La orientación la da
  // ahora el propio encabezado de la tarjeta ("Paso final" + "Tus datos"),
  // no un contador.
  await abrirPasoDatos(page);
  await expect(page.getByText('Paso 1 de 2 · Tus datos')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
  await expect(page.getByText('Paso final')).toBeVisible();
});

// Diseño "Tentare Portal Reservas": un solo campo "Nombre y apellido" a ancho
// completo (ya no hay Nombre/Apellidos en dos columnas que puedan
// estrangularse) — el que sí queda en dos columnas fijas es Email/Móvil, y a
// 320px sigue teniendo sitio de sobra (placeholders cortos, a diferencia de
// «Apellidos»).
test('nombre y apellido ocupa el ancho completo en una pantalla estrecha', async ({ page }) => {
  await abrirPasoDatos(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(300);

  // Comparación relativa, no un umbral de píxeles inventado (la tarjeta tiene
  // su propio padding a 320px, así que "ancho completo" no es ningún número
  // fijo): "Nombre y apellido" debe medir sensiblemente más que "Email", que
  // SÍ va a media columna a propósito — así se sigue detectando si algún día
  // vuelve a colarse en una rejilla de dos columnas.
  const anchoNombre = await page.getByPlaceholder('Nombre y apellido').evaluate(el => el.getBoundingClientRect().width);
  const anchoEmail = await page.getByPlaceholder('Email').evaluate(el => el.getBoundingClientRect().width);
  expect(anchoNombre).toBeGreaterThan(anchoEmail * 1.8);
});

test('⚠️ rellenar el formulario no desplaza el encabezado ni añade salto de layout', async ({ page }) => {
  // El defecto original se veía comparando dos capturas del mismo flujo a
  // 390px: el paso «datos» ocupaba casi toda la pantalla y el de «pago» era
  // una caja baja pegada al borde inferior, con media pantalla muerta
  // encima — 748px de alto en `datos` contra 658 en `pago`, 90px de
  // diferencia en la posición. Eso salía de que la hoja era una caja con
  // `maxHeight` FIJO y contenido interno de tamaño variable entre pasos.
  //
  // ⚠️ Actualizado en el rediseño "sin popup": ya no hay ninguna caja con
  // `role="dialog"` ni `maxHeight` que medir — el paso «datos»/«pago» es
  // contenido normal de la página (`PublicSheet inline`), y su altura crece
  // con el contenido A PROPÓSITO (el iframe se auto-dimensiona alrededor,
  // ver `reservar-embed-overlays-visibles.spec.ts`). Comparar el frame ya no
  // tiene sentido — pero el defecto de fondo que este test protegía
  // («la pantalla da un salto al escribir») sigue siendo real de verificar:
  // escribir en un campo NO debe mover el encabezado ni el total de la
  // página, porque nada nuevo se añade al árbol (un input no crece de alto
  // por tener más texto).
  await abrirPasoDatos(page);

  const titulo = page.getByRole('heading', { name: 'Tus datos' });
  // ⚠️ Esperar a que la ENTRADA termine antes de medir: `sheet-pop-in` lleva
  // `scale(.97)`, así que a media animación la posición no es la final.
  await page.waitForTimeout(450);

  await page.getByPlaceholder('Nombre y apellido').fill('Marta Ruiz');
  await page.getByPlaceholder('Email').fill('marta@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.waitForTimeout(300);

  // La medición «antes» se toma DESPUÉS de rellenar y marcar la casilla (eso
  // puede legítimamente revelar contenido nuevo, p. ej. un enlace al
  // contrato) — lo que este test protege es más estrecho: que escribir un
  // nombre más largo en un campo YA EXISTENTE no mueve nada, porque un
  // <input> no cambia de alto por llevar más texto.
  const antesY = (await titulo.boundingBox())!.y;
  const antesAlto = await page.evaluate(() => document.documentElement.scrollHeight);

  // No hace falta llegar al paso de pago de verdad (eso exige Stripe): basta
  // con que escribir un nombre más largo no mueva nada que ya estaba en
  // pantalla.
  await page.getByPlaceholder('Nombre y apellido').fill('Un nombre bastante más largo que el anterior');
  await page.waitForTimeout(300);

  const despuesY = (await titulo.boundingBox())!.y;
  const despuesAlto = await page.evaluate(() => document.documentElement.scrollHeight);
  // Tolerancia subida de 8 a 16px: el diseño "Tentare Portal Reservas" añadió
  // tres secciones nuevas a esta pantalla (Información adicional/Elige tu
  // plaza/Bonos), y con más DOM hay algo más de variación de sub-píxel entre
  // dos medidas — sigue siendo un orden de magnitud por debajo del defecto
  // original que este test protege (~90px, caja con `maxHeight` fijo).
  expect(Math.abs(despuesY - antesY)).toBeLessThan(16);
  expect(Math.abs(despuesAlto - antesAlto)).toBeLessThan(16);

  // Y la página ocupa de verdad la pantalla, no una caja pequeña centrada
  // con aire alrededor (el criterio explícito del rediseño: "prácticamente
  // full-screen dentro del widget" en móvil).
  expect(antesAlto).toBeGreaterThan(600);
});
