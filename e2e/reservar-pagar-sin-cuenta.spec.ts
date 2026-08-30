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
  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): la tarjeta de la lista ya no abre una hoja de
  // DETALLE intermedia con su propio botón "Reservar" — un tap dispara
  // handleReservarCalendario/openBooking directo. "Tus datos" trae su propia
  // foto/descripción/ubicación, así que la ficha quedaba redundante para
  // este camino.
  //
  // P1-confianza: la fila de plazas habla en plazas LIBRES («10 plazas
  // libres»), nunca en el ratio de panel «0/10 · 10 libres» que la auditoría
  // señaló como confuso («0/10» se leía como «cero plazas»). Se comprueba
  // AQUÍ, en la propia tarjeta (antes de abrir, ya que ahora no hay hoja de
  // detalle intermedia donde repetirlo) — misma protección, mismo texto.
  const tarjeta = page.getByRole('button', { name: /Reformer a las 10:00/ });
  await expect(tarjeta.getByText('10 plazas libres')).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta.getByText('0/10')).not.toBeVisible();

  await tarjeta.click();
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

  // Diseño "Tentare Portal Reservas": un solo campo "Nombre y apellido"
  // (Email/Móvil en dos columnas), no Nombre/Apellidos por separado.
  await page.getByPlaceholder('Nombre y apellido').fill('Marta Ruiz');
  await page.getByPlaceholder('Email').fill('marta.ruiz@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  // Casilla explícita de privacidad (rediseño del popup): sin marcarla, el
  // botón de pago queda deshabilitado.
  await expect(page.getByRole('button', { name: /Continuar al pago/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();

  await page.waitForTimeout(1500);
  expect(intentos, 'el pago no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  expect(ultimoBody).toMatchObject({
    studioId: STUDIO_ID, planId: 'plan-suelto', sesionId: SESION_ID,
    socioEmail: 'marta.ruiz@example.com', socioNombre: 'Marta Ruiz',
    // El teléfono viaja al servidor (antes se validaba y se TIRABA — la
    // ficha creada por el webhook quedaba sin él).
    socioTelefono: '+34 600 123 456',
  });

  // Sin socioId: nunca se manda una identidad que la visitante no tiene todavía.
  expect(ultimoBody.socioId).toBeUndefined();

  // Llega al paso de pago y aparece el resumen de la clase. No se comprueba
  // el Payment Element de Stripe (límite de entorno, ver cabecera del
  // fichero) — y por lo mismo tampoco los `defaultValues.billingDetails`
  // prefijados: viven DENTRO del iframe de Stripe, que con un clientSecret
  // de mentira no llega a montarse.
  // ⚠️ Ya no hay `role="dialog"` que darle nombre (rediseño "sin popup") — el
  // paso de pago se distingue por su propio CTA, único en la página.
  const ctaPago = page.getByRole('button', { name: 'Pagar 18 € y reservar' });
  await expect(ctaPago).toBeVisible({ timeout: 15_000 });

  // P1-confianza: la línea de confianza nombra a Stripe (hecho veraz — el
  // pago lo procesa Stripe) y arrastra la ventana de cancelación REAL del
  // estudio del fixture (12h), nunca un genérico.
  await expect(page.getByText('Pago seguro procesado por Stripe · Cancelación gratuita hasta 12h antes')).toBeVisible();
  // P0 (queja literal del fundador): "Pagar y reservar → 1 €" se leía como
  // "-1 €". Se comprueba sobre el propio botón (único importe con flecha
  // posible en este paso), no sobre toda la página: la ficha de la clase
  // (columna izquierda) también enseña el precio, sin flecha, y no debe
  // hacer sospechosa la aserción.
  const textoCta = await ctaPago.innerText();
  expect(textoCta, 'ningún importe puede ir precedido de una flecha').not.toMatch(/→\s*\d+([.,]\d+)?\s*€/);
  expect(textoCta, 'ningún importe puede ir precedido de un interpunto').not.toMatch(/·\s*\d+([.,]\d+)?\s*€/);
});

test('⚠️ un 409 de checkout-embebido NO se anuncia como pago iniciado', async ({ page }) => {
  await abrirClaseSinSesion(page);
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });

  let intentos = 0;
  await page.route('**/api/public/checkout-embebido', (r) => {
    intentos += 1;
    return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Esta clase ya ha empezado' }) });
  });

  // Diseño "Tentare Portal Reservas": un solo campo "Nombre y apellido"
  // (Email/Móvil en dos columnas), no Nombre/Apellidos por separado.
  await page.getByPlaceholder('Nombre y apellido').fill('Marta Ruiz');
  await page.getByPlaceholder('Email').fill('marta.ruiz@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await page.waitForTimeout(1500);

  expect(intentos, 'el pago no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  // Sin `role="dialog"` que comprobar (rediseño "sin popup"): el CTA de pago
  // ("Pagar 18 € y reservar") es la prueba de que SÍ se llegó a montar el
  // paso de pago — su ausencia sería la señal real de que el 409 se coló
  // como si el pago hubiera arrancado.
  await expect(page.getByRole('button', { name: 'Pagar 18 € y reservar' })).not.toBeVisible();
  await expect(page.getByText('Esta clase ya ha empezado')).toBeVisible();
  // Reintentable: el botón no se queda inerte tras el fallo.
  await expect(page.getByRole('button', { name: /Continuar al pago/ })).toBeEnabled();
});

test('⚠️ la hoja de la ficha y el modal de acceso nunca coexisten en pantalla', async ({ page }) => {
  // El bug real: `handleReservarCalendario` delega al modal de acceso
  // (`openBooking()`) de forma SÍNCRONA cuando no hay sesión, pero
  // `BookingSheet` solo cerraba su propia hoja DESPUÉS de un `await` sobre ese
  // resultado. Un `await` siempre cede al menos un microtask, así que React
  // podía pintar el frame en el que el modal de acceso YA está abierto y la
  // hoja de la ficha TODAVÍA no se ha cerrado — invisible en la ejecución
  // instantánea de un test normal, pero real en un dispositivo más lento
  // (visto en vídeo: la franja naranja del CTA de la ficha asomando tras el
  // modal de "Tus datos").
  //
  // ⚠️ No se reutiliza `abrirClaseSinSesion`: su última línea YA hace el clic
  // que abre "Tus datos", así que instrumentar DESPUÉS de llamarla llega
  // tarde — el tránsito ya ocurrió. Se repite el arranque hasta justo antes
  // del clic, a propósito.
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureClaseConPlanPuntual()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  const tarjeta = page.getByRole('button', { name: /Reformer a las 10:00/ });
  await expect(tarjeta).toBeVisible({ timeout: 15_000 });

  // Se instrumenta con un MutationObserver —no con `requestAnimationFrame`—
  // porque el reloj simulado de `page.clock.install()` (arriba) también
  // congela rAF, y con él la instrumentación nunca se ejecutaría. Un
  // MutationObserver corre en cuanto el DOM cambia, sin depender de ningún
  // reloj: cuenta, en cada mutación, cuántos `role="dialog"` hay a la vez.
  await page.evaluate(() => {
    (window as unknown as { __maxDialogs: number }).__maxDialogs = 0;
    const medir = () => {
      const n = document.querySelectorAll('[role="dialog"]').length;
      const w = window as unknown as { __maxDialogs: number };
      if (n > w.__maxDialogs) w.__maxDialogs = n;
    };
    medir();
    new MutationObserver(medir).observe(document.body, { childList: true, subtree: true, attributes: true });
  });

  await tarjeta.click();
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  // Unos fotogramas más tras la transición, por si el pico llega tarde.
  await page.waitForTimeout(300);

  const maxDialogs = await page.evaluate(() => (window as unknown as { __maxDialogs: number }).__maxDialogs);
  expect(maxDialogs, 'las dos hojas coexistieron en algún fotograma pintado').toBeLessThanOrEqual(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 del rediseño (docs/rediseno-pantalla-reserva-diseno.md): feedback en
// vivo del código promocional contra /api/public/validar-codigo-descuento —
// antes la única forma de enterarse de que un código no valía era mirar el
// importe ya dentro del Payment Element.
// ─────────────────────────────────────────────────────────────────────────────

test('código promocional: válido muestra el descuento, inválido explica por qué', async ({ page }) => {
  await abrirClaseSinSesion(page);
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });

  let ultimoCodigo = '';
  await page.route('**/api/public/validar-codigo-descuento', (r) => {
    ultimoCodigo = (r.request().postDataJSON() as { codigo?: string }).codigo ?? '';
    if (ultimoCodigo.toUpperCase() === 'BIENVENIDA') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, descuento: 3 }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, motivo: 'Ese código no existe' }) });
  });

  // ⚠️ Ya no hace falta escopar a un diálogo (rediseño "sin popup"): con el
  // flujo de reserva activo, el resto de la página (Bonos y membresías, la
  // ficha de la clase, etc.) se oculta entera — no hay ningún otro "18 €"
  // con el que confundirse.
  await page.getByText('¿Tienes un código promocional?').click();
  const campoCodigo = page.getByPlaceholder('Código promocional');

  // Inválido: explica el motivo, no un genérico "código no válido".
  await campoCodigo.fill('LOQUESEA');
  await expect(page.getByText('Ese código no existe')).toBeVisible({ timeout: 3_000 });
  expect(ultimoCodigo).toBe('LOQUESEA');

  // Válido: el descuento se ve ANTES de pagar, y el total tachado deja claro
  // que ya cuenta (P0 auditado contra Momence: nunca "se aplicará luego").
  await campoCodigo.fill('BIENVENIDA');
  await expect(page.getByText('Código aplicado: −3 €')).toBeVisible({ timeout: 3_000 });
  await expect(page.getByText('18 €', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('15 €', { exact: true }).first()).toBeVisible();

  // Quitar: el botón X limpia el código y su estado, sin esperar a nada.
  await page.getByRole('button', { name: 'Quitar código' }).click();
  await expect(page.getByText('Código aplicado')).not.toBeVisible();
  await expect(campoCodigo).toHaveValue('');
});
