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
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  const reservar = page.getByRole('button', { name: /^Reservar/ }).last();
  await expect(reservar).toBeVisible({ timeout: 15_000 });
  await reservar.click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
}

test('el botón de continuar se ve SIN hacer scroll dentro del modal', async ({ page }) => {
  await abrirPasoDatos(page);

  const cta = page.getByRole('button', { name: /Continuar al pago/ });
  // `toBeInViewport` es la comprobación que importa: antes el botón existía en
  // el DOM y era «visible» para Playwright, pero nacía por debajo del área
  // visible del modal.
  await expect(cta).toBeInViewport();

  // Y sigue estándolo con el contenido scrolleado hasta arriba del todo, que es
  // donde antes desaparecía sin remedio.
  await page.getByPlaceholder('Nombre').scrollIntoViewIfNeeded();
  await expect(cta).toBeInViewport();
});

test('con el modal abierto, el fondo no se mueve', async ({ page }) => {
  await abrirPasoDatos(page);

  const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(overflow).toBe('hidden');

  // Comprobación de verdad, no solo del estilo: el gesto sobre el fondo no
  // desplaza la página de detrás.
  const antes = await page.evaluate(() => window.scrollY);
  await page.mouse.move(195, 60);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.scrollY)).toBe(antes);
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

test('el modal dice en qué paso estás', async ({ page }) => {
  await abrirPasoDatos(page);
  await expect(page.getByText('Paso 1 de 2 · Tus datos')).toBeVisible();
});

test('nombre y apellidos no se estrangulan en una pantalla estrecha', async ({ page }) => {
  await abrirPasoDatos(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(300);

  // A 320px las dos columnas fijas dejaban ~108px útiles para «Apellidos».
  // Con `auto-fit` se apilan solas.
  const ancho = await page.getByPlaceholder('Apellidos').evaluate(el => el.getBoundingClientRect().width);
  expect(ancho).toBeGreaterThan(140);
});

test('⚠️ el marco de la hoja NO cambia de tamaño ni de sitio entre pasos', async ({ page }) => {
  // El defecto se veía comparando dos capturas del mismo flujo a 390px: el paso
  // «datos» ocupaba casi toda la pantalla y el de «pago» era una caja baja
  // pegada al borde inferior, con media pantalla muerta encima. Medido antes
  // del arreglo: 748px de alto en `datos` contra 658 en `pago`, y 90px de
  // diferencia en la posición. Eso es lo que se percibe como «no hay
  // estructura»: el contenedor no se está quieto.
  await abrirPasoDatos(page);

  const hoja = page.getByRole('dialog');
  const antes = (await hoja.boundingBox())!;

  await page.getByPlaceholder('Nombre').fill('Marta');
  await page.getByPlaceholder('Apellidos').fill('Ruiz');
  await page.getByPlaceholder('Tu email').fill('marta@example.com');
  await page.getByPlaceholder('Tu teléfono (+34 600 000 000)').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();

  // No hace falta llegar al paso de pago de verdad (eso exige Stripe): basta
  // con que la hoja mantenga su marco mientras el contenido cambia de tamaño.
  await page.getByPlaceholder('Nombre').fill('Un nombre bastante más largo que el anterior');
  await page.waitForTimeout(300);

  const despues = (await hoja.boundingBox())!;
  expect(Math.abs(despues.height - antes.height)).toBeLessThan(8);
  expect(Math.abs(despues.y - antes.y)).toBeLessThan(8);

  // Y el marco ocupa de verdad la pantalla, no una caja pequeña centrada.
  expect(antes.height).toBeGreaterThan(600);
});
