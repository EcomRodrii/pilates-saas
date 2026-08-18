import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md).
//
// Una visitante SIN sesión, en una clase que exige plan, ya no tiene por qué
// pasar por el paso 'login' (enlace mágico) antes de poder pagar — si hay un
// plan de una sola clase (PUNTUAL) que cubre el tipo, "Reservar clase" abre
// directamente el paso 'datos' (nombre/apellidos/email/teléfono, sin
// contraseña) y de ahí al pago embebido. La cuenta se crea DESPUÉS, como
// consecuencia del pago — nunca antes.
//
// ⚠️ Mismo criterio que reservar-el-servidor-dice-no.spec.ts: todo test de
// camino de fallo exige `intentos > 0` antes de interpretar nada, y ningún
// test da por buena una escritura sin comprobar la respuesta real del
// servidor. Ver [[test-4xx-necesita-contador-de-intentos]].
//
// Lo que NO se prueba aquí (límite de entorno, documentado repetidas veces en
// este repo para cualquier pieza de Stripe): la confirmación real del pago
// dentro del Payment Element de Stripe.js, ni el webhook que crea la reserva
// y la cuenta — eso exige un PaymentIntent real. Se prueba hasta el punto en
// el que la propia página confía en el servidor: que el paso 'datos' se abre
// SIN pedir login, que solo llama a checkout-embebido con datos completos, y
// que un 4xx de ese endpoint se ve y no se silencia como si el pago hubiera
// arrancado.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';
const SESION_ID = 'ses-puntual';

function fixtureClaseConPlanPuntual() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
      reservaExigirPlan: true,
      // Necesario para que el paso 'pago' llegue a montarse (studio.stripeAccountId).
      stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Plan PUNTUAL (una sola sesión) que cubre TODOS los tipos (sin tiposClaseIds
    // = cubre todo, mismo criterio que el resto del repo) — es el que
    // planClaseSueltaPara debe encontrar.
    planesTarifa: [
      { id: 'plan-suelto', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 18, sesiones: 1, activo: true },
    ],
    sesiones: [{
      id: SESION_ID, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
      inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false,
    }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [],
    // Visitante SIN sesión — a propósito, es el caso que este flujo cubre.
    socia: null,
  };
}

async function abrirClaseSinSesion(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureClaseConPlanPuntual()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));

  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  // La fila solo abre la hoja de DETALLE de la clase (precio, sala, horario) —
  // el botón "Reservar" de esa hoja es el que de verdad dispara
  // handleReservarCalendario/openBooking. Mismo patrón en dos pasos que
  // abrirHojaDeClase/pulsarReservar en socia-lista.ts.
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  const botonReservar = page.getByRole('button', { name: /^Reservar/ }).last();
  await expect(botonReservar).toBeVisible({ timeout: 15_000 });
  await botonReservar.click();
}

test('visitante SIN cuenta: "Reservar clase" abre datos, no login', async ({ page }) => {
  await abrirClaseSinSesion(page);

  // El punto central del rediseño: nunca "Entra para reservar" primero.
  await expect(page.getByText('Entra para reservar')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No necesitas crear una cuenta')).toBeVisible();
});

test('rellenar datos y continuar llama a checkout-embebido con nombre/email/teléfono/sesión', async ({ page }) => {
  await abrirClaseSinSesion(page);
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });

  let intentos = 0;
  let ultimoBody: Record<string, unknown> = {};
  await page.route('**/api/public/checkout-embebido', (r) => {
    intentos += 1;
    ultimoBody = r.request().postDataJSON() as Record<string, unknown>;
    // Stripe Elements valida la FORMA de `clientSecret` (pi_<alfanumérico>_secret_<alfanumérico>,
    // sin guiones bajos de más) y lanza de forma síncrona si no la reconoce —
    // un valor con guiones bajos extra tumbaba la página entera (mismo tipo de
    // fallo que loadStripe() con una clave inválida, ver checkout-embebido.tsx).
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000' }) });
  });

  await page.getByPlaceholder('Nombre').fill('Marta');
  await page.getByPlaceholder('Apellidos').fill('Ruiz');
  await page.getByPlaceholder('Tu email').fill('marta.ruiz@example.com');
  await page.getByPlaceholder('Tu teléfono (+34 600 000 000)').fill('+34 600 123 456');
  await page.getByRole('button', { name: /Continuar al pago/ }).click();

  await page.waitForTimeout(1500);
  expect(intentos, 'el pago no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  expect(ultimoBody).toMatchObject({
    studioId: STUDIO_ID, planId: 'plan-suelto', sesionId: SESION_ID,
    socioEmail: 'marta.ruiz@example.com', socioNombre: 'Marta Ruiz',
  });

  // Sin socioId: nunca se manda una identidad que la visitante no tiene todavía.
  expect(ultimoBody.socioId).toBeUndefined();

  // Llega al paso de pago — la cabecera del modal cambia y aparece el resumen
  // de la clase. No se comprueba el Payment Element de Stripe (límite de
  // entorno, ver cabecera del fichero).
  await expect(page.getByRole('dialog', { name: 'Pagar y reservar' })).toBeVisible({ timeout: 15_000 });
});

test('⚠️ un 409 de checkout-embebido NO se anuncia como pago iniciado', async ({ page }) => {
  await abrirClaseSinSesion(page);
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });

  let intentos = 0;
  await page.route('**/api/public/checkout-embebido', (r) => {
    intentos += 1;
    return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Esta clase ya ha empezado' }) });
  });

  await page.getByPlaceholder('Nombre').fill('Marta');
  await page.getByPlaceholder('Apellidos').fill('Ruiz');
  await page.getByPlaceholder('Tu email').fill('marta.ruiz@example.com');
  await page.getByPlaceholder('Tu teléfono (+34 600 000 000)').fill('+34 600 123 456');
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await page.waitForTimeout(1500);

  expect(intentos, 'el pago no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  await expect(page.getByRole('dialog', { name: 'Pagar y reservar' })).not.toBeVisible();
  await expect(page.getByText('Esta clase ya ha empezado')).toBeVisible();
  // Reintentable: el botón no se queda inerte tras el fallo.
  await expect(page.getByRole('button', { name: /Continuar al pago/ })).toBeEnabled();
});
