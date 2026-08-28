import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P1-3 — confirmación REAL de la reserva tras «pagar y reservar sin login»
// (Modo A). Tras confirmar el PaymentIntent, la reserva la crea el WEBHOOK:
// el paso 'done' hace polling a /api/public/estado-pago y solo dice «tu plaza
// está confirmada» cuando el servidor lo confirma. Tests obligatorios del
// fundador que cubre: «pago exitoso pero webhook retrasado → no generar
// estados inconsistentes» y «pago fallido → no crear una reserva confirmada».
//
// Cómo se llega a 'done' sin Stripe real (límite de entorno de siempre): se
// sirve un STUB de Stripe.js por page.route — implementa lo mínimo que
// @stripe/react-stripe-js exige (elements/create/mount/on('ready')) y un
// confirmPayment que resuelve `succeeded`. Así el flujo recorre el MISMO
// código de la página (pagar → onExito → handlePagoExitoso → 'done' →
// polling), no un estado forzado por dentro.
//
// ⚠️ Mismo criterio que reservar-pagar-sin-cuenta.spec.ts: contador de
// peticiones SIEMPRE — un polling que no llega a preguntar nada dejaría
// estos tests en verde sin probar nada ([[test-4xx-necesita-contador-de-intentos]]).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';
const SESION_ID = 'ses-puntual';
const CLIENT_SECRET = 'pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000';

function fixtureClaseConPlanPuntual() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
      reservaExigirPlan: true,
      stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
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
    socia: null,
  };
}

// Stub mínimo de Stripe.js. `isStripe` de @stripe/react-stripe-js exige
// elements/createToken/createPaymentMethod/confirmCardPayment como funciones;
// el PaymentElement necesita create → mount → on('ready') para que la página
// habilite el botón de pagar; y confirmPayment devuelve `succeeded`, que es
// el disparo real de onExito → handlePagoExitoso.
const STRIPE_STUB = `
window.Stripe = function () {
  var mkElement = function () {
    var handlers = {};
    var el = {
      mount: function (target) {
        var node = typeof target === 'string' ? document.querySelector(target) : target;
        if (node) node.textContent = 'stripe-stub';
        setTimeout(function () { (handlers['ready'] || []).forEach(function (f) { f(el); }); }, 50);
      },
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return el; },
      off: function () { return el; },
      once: function (ev, fn) { return el.on(ev, fn); },
      update: function () { return el; },
      destroy: function () {}, unmount: function () {},
      blur: function () {}, clear: function () {}, focus: function () {}, collapse: function () {},
    };
    return el;
  };
  return {
    elements: function () {
      return {
        create: mkElement,
        getElement: function () { return null; },
        update: function () {},
        fetchUpdates: function () { return Promise.resolve({}); },
        submit: function () { return Promise.resolve({}); },
        on: function () {},
      };
    },
    createToken: function () { return Promise.resolve({}); },
    createPaymentMethod: function () { return Promise.resolve({}); },
    confirmCardPayment: function () { return Promise.resolve({}); },
    confirmPayment: function () {
      // El comportamiento lo elige cada test con window.__TENTARE_CONFIRM.
      var modo = window.__TENTARE_CONFIRM || 'succeeded';
      if (modo === 'throw') { throw new Error('IntegrationError simulado'); }
      if (modo === 'reject') { return Promise.reject(new Error('IntegrationError simulado')); }
      if (modo === 'pending') { return new Promise(function () {}); }  // NUNCA resuelve
      return Promise.resolve({ paymentIntent: { status: 'succeeded' } });
    },
    registerAppInfo: function () {},
    _registerWrapper: function () {},
  };
};
`;

async function pulsarPagar(page: Page, modoConfirm: 'succeeded' | 'throw' | 'reject' | 'pending' = 'succeeded') {
  await page.addInitScript((m) => { (window as unknown as Record<string, string>).__TENTARE_CONFIRM = m; }, modoConfirm);
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  // El enlace mágico post-pago (signInWithOtp) — mock neutro, no se prueba aquí.
  await page.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({}) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureClaseConPlanPuntual()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  await page.route('**/api/public/checkout-embebido', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: CLIENT_SECRET }) }));

  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  const botonReservar = page.getByRole('button', { name: /^Reservar/ }).last();
  await expect(botonReservar).toBeVisible({ timeout: 15_000 });
  await botonReservar.click();

  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  // Diseño "Tentare Portal Reservas": un solo campo "Nombre y apellido".
  await page.getByPlaceholder('Nombre y apellido').fill('Marta Ruiz');
  await page.getByPlaceholder('Email').fill('marta.ruiz@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();

  const botonPagar = page.getByRole('button', { name: 'Pagar 18 € y reservar' });
  await expect(botonPagar).toBeEnabled({ timeout: 20_000 });
  await botonPagar.click();
}

// Solo llega hasta pulsar «Pagar». Separado de `pagarHastaDone` porque los
// caminos de FALLO nunca alcanzan el paso 'done' — esperar su ancla ahí sería
// un test que no puede pasar por construcción.
async function pagarHastaDone(page: Page, modoConfirm: 'succeeded' | 'throw' | 'reject' | 'pending' = 'succeeded') {
  await pulsarPagar(page, modoConfirm);
  // Ancla ESTABLE del paso 'done' (existe en todos los estados de
  // confirmación): el título cambia con el polling, esto no.
  await expect(page.getByText('Tus clases y tus bonos están en tu portal', { exact: false })).toBeVisible({ timeout: 20_000 });
}

test('webhook retrasado: confirmando → confirmada con los datos REALES, tras ≥2 polls', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/public/estado-pago**', (r) => {
    polls += 1;
    const body = polls <= 3
      ? { estado: 'en_proceso' }
      : { estado: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-08-12T10:00:00' } };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Registrado ANTES de llegar a 'done': el primer poll sale ~1s después de
  // entrar y no se puede perder. La identidad viaja completa: el PI derivado
  // del clientSecret y el email del paso 'datos'.
  const reqPromise = page.waitForRequest((rq) =>
    rq.url().includes('/api/public/estado-pago') &&
    rq.url().includes('pi=pi_3QeXaMPLe000000000000') &&
    rq.url().includes(encodeURIComponent('marta.ruiz@example.com')),
    { timeout: 60_000 });

  await pagarHastaDone(page);

  // Mientras el servidor dice 'en_proceso', el copy es el honesto de siempre —
  // jamás «confirmada» por adelantado.
  await expect(page.getByText('Estamos confirmando tu plaza', { exact: false })).toBeVisible();
  await expect(page.getByText('¡Plaza confirmada!')).not.toBeVisible();

  const req = await reqPromise;
  expect(req.url()).toContain(`studioId=${STUDIO_ID}`);

  // Confirmación REAL: llega tras el 4º poll, con la clase que devolvió el
  // servidor. El backoff existe de verdad: hubo al menos 2 polls «en_proceso»
  // antes de confirmar.
  await expect(page.getByText('¡Plaza confirmada!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tu plaza está confirmada', { exact: false })).toBeVisible();
  expect(polls, 'la confirmación no puede llegar sin haber preguntado varias veces').toBeGreaterThanOrEqual(4);

  // Con plaza confirmada aparece el bloque de calendario (antes no: no se
  // ofrece guardar en el calendario una plaza que no consta).
  await expect(page.getByText('Añadir a tu calendario')).toBeVisible();
});

test('el webhook nunca confirma: agotado el techo → copy de «tardando», JAMÁS «confirmada»', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/public/estado-pago**', (r) => {
    polls += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ estado: 'en_proceso' }) });
  });

  await pagarHastaDone(page);
  await expect(page.getByText('Estamos confirmando tu plaza', { exact: false })).toBeVisible();

  // Techo del polling ~35s (RETARDOS_POLL_MS): pasado, el copy honesto de
  // «tardando» — pago recibido, confirmación por email, estudio como recurso.
  await expect(page.getByText('tardando más de lo normal', { exact: false })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('escribe al estudio', { exact: false })).toBeVisible();
  expect(polls, 'sin polls el test no prueba nada').toBeGreaterThanOrEqual(2);

  // Lo que NUNCA puede pasar: anunciar la plaza sin confirmación del servidor.
  await expect(page.getByText('¡Plaza confirmada!')).not.toBeVisible();
  await expect(page.getByText('Tu plaza está confirmada', { exact: false })).not.toBeVisible();
  await expect(page.getByText('Añadir a tu calendario')).not.toBeVisible();
});

test('lista de espera: el aforo voló entre pago y reserva → se dice claro', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/public/estado-pago**', (r) => {
    polls += 1;
    const body = polls === 1
      ? { estado: 'en_proceso' }
      : { estado: 'lista_espera', clase: { nombre: 'Reformer', inicio: '2026-08-12T10:00:00' } };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await pagarHastaDone(page);

  await expect(page.getByText('¡En lista de espera!')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('la clase se ha llenado justo antes de confirmar tu plaza', { exact: false })).toBeVisible();
  await expect(page.getByText('tu bono queda en tu cuenta', { exact: false })).toBeVisible();
  expect(polls, 'sin polls el test no prueba nada').toBeGreaterThanOrEqual(2);
  // Ni confirmación ni calendario: no hay plaza que guardar.
  await expect(page.getByText('¡Plaza confirmada!')).not.toBeVisible();
  await expect(page.getByText('Añadir a tu calendario')).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Regresión de un cuelgue REAL de producción (2026-08-20, primer pago con
// Apple Pay): `confirmPayment` puede RECHAZAR la promesa en vez de devolver
// `{ error }`. `pagar()` no tenía `try/catch`, así que la excepción se llevaba
// por delante el `setEnviando(false)` y el botón se quedaba en «Procesando el
// pago…» para siempre: sin éxito, sin error y sin forma de salir.
//
// El caso 'pending' es todavía peor y también ocurrió: una promesa que no
// resuelve NUNCA. Contra eso el `try` no basta y hace falta un tope de tiempo.
// ─────────────────────────────────────────────────────────────────────────────

for (const modo of ['throw', 'reject'] as const) {
  test(`⚠️ si Stripe.js lanza (${modo}), el botón NO se queda en «Procesando el pago…»`, async ({ page }) => {
    await pulsarPagar(page, modo);

    // El botón vuelve a estar disponible y se explica qué ha pasado.
    await expect(page.getByText('Procesando el pago…')).toHaveCount(0, { timeout: 20_000 });
    // `.first()`: el aviso tiene titular y cuerpo, y los dos empiezan igual.
    await expect(page.getByText('No hemos podido procesar el pago', { exact: false }).first()).toBeVisible();
    // Y se puede reintentar: el botón de pagar sigue vivo, no deshabilitado.
    await expect(page.getByRole('button', { name: /Pagar/ })).toBeEnabled();
  });
}

test('⚠️ si la promesa no resuelve NUNCA, el tope de tiempo devuelve el control', async ({ page }) => {
  await pulsarPagar(page, 'pending');

  // Mientras corre el reloj, el botón está en su estado de proceso: eso es
  // correcto. Lo que no puede es quedarse ahí para siempre.
  await expect(page.getByText('Procesando el pago…')).toBeVisible();

  // `page.clock` está instalado, así que el tope de 90 s se puede adelantar sin
  // esperar de verdad.
  await page.clock.fastForward('01:40');

  await expect(page.getByText('Procesando el pago…')).toHaveCount(0, { timeout: 20_000 });
  // Y el mensaje NO promete que no se haya cobrado: aquí no se sabe.
  await expect(page.getByText('Comprueba tu banco', { exact: false })).toBeVisible();
});
