import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El alta pública de un estudio (/crear-estudio), ahora que Tentare está
// abierto: tres pasos, prueba de 7 días y sin tarjeta.
//
// Esta pantalla estuvo meses siendo un formulario de lista de espera, así que
// todo lo que hay aquí es camino nuevo. Se prueba lo que de verdad se rompe en
// un alta: ir y volver entre pasos, recargar a media faena, que el servidor
// diga que no, y que un email ya registrado no reciba un «revisa tu correo»
// que es mentira.
//
// El tramo del CÓDIGO de verificación vive en e2e/alta-otp.spec.ts.
//
// ⚠️ Los caminos de fallo llevan CONTADOR de peticiones. Sin él, un test que
// solo mira que no aparece un mensaje verde pasaría igual si el formulario no
// hubiera llegado a enviar nada — el punto ciego que ya costó dos tests en
// verde sobre una pantalla rota (ver .claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Alta creada, falta confirmar el email: sin sesión pero con `identities`. */
const ALTA_PENDIENTE_DE_EMAIL = {
  user: { id: 'u1', email: 'ana@example.com', identities: [{ id: 'i1' }] },
  session: null,
};

/** El usuario fantasma que devuelve gotrue cuando el email YA está registrado. */
const EMAIL_YA_REGISTRADO = {
  user: { id: 'u0', email: 'ana@example.com', identities: [] },
  session: null,
};

/**
 * Paso 1 → 2.
 *
 * ⚠️ Reintenta a propósito, y no es pereza: es la PRIMERA interacción tras
 * `goto`, la única expuesta a escribir antes de que React hidrate.
 *
 * `/crear-estudio` es un componente de cliente que Next renderiza también en
 * servidor, así que el input existe —y `fill()` funciona— antes de que React
 * tome el control. Cuando hidrata, el input es CONTROLADO: React lo devuelve a
 * su estado, que está vacío, y se lleva por delante lo escrito. El clic sí
 * llega, pero valida contra un nombre vacío.
 *
 * No es teoría: la captura del fallo en CI (run 33672459700, webkit-publico)
 * enseña el paso 1 con el campo VACÍO y el aviso «Escribe el nombre de tu
 * estudio» — el clic había funcionado, lo que se perdió fue el texto. Se cayó
 * tres veces en un día (#1546, #1567, #1581) y siempre en WebKit, que hidrata
 * más lento; el ruido de `ENOTFOUND example.supabase.co` del servidor ensancha
 * esa ventana bajo carga.
 *
 * Por eso no vale con esperar al botón (existe y está habilitado desde el HTML
 * del servidor) ni con comprobar el valor justo tras escribir (sobrevive hasta
 * que hidrata, y entonces se borra). Lo único que demuestra que la app RECIBIÓ
 * el nombre es que la pantalla avance — así que se reintenta hasta eso.
 */
async function rellenarPaso1(page: Page, nombre = 'Estudio Aurora') {
  const plan = page.getByRole('heading', { name: 'Tu plan' });
  await expect(async () => {
    // Si un intento anterior ya pasó de paso, no se vuelve a escribir: el campo
    // ya no está en pantalla y el reintento fallaría para siempre.
    if (await plan.isVisible()) return;
    await page.getByRole('textbox', { name: 'Nombre de tu estudio' }).fill(nombre);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(plan).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/** Paso 2 → 3. El plan ya viene elegido, así que solo hay que continuar. */
async function pasarDelPlan(page: Page) {
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
}

async function rellenarPaso3(page: Page, email = 'ana@example.com') {
  await page.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('contrasena-larga');
}

test.describe('Crear un estudio de principio a fin', () => {
  test('los tres pasos, y termina pidiendo confirmar el email', async ({ page }) => {
    let altas = 0;
    let metadata: Record<string, unknown> | null = null;
    await page.route('**/auth/v1/signup**', async route => {
      altas += 1;
      metadata = (route.request().postDataJSON() as { data?: Record<string, unknown> })?.data ?? null;
      return json(route, ALTA_PENDIENTE_DE_EMAIL);
    });

    await page.goto('/crear-estudio');
    await expect(page.getByRole('heading', { name: 'Tu estudio' })).toBeVisible();

    await rellenarPaso1(page);
    await pasarDelPlan(page);
    await rellenarPaso3(page);
    await page.getByRole('button', { name: /días gratis/ }).click();

    await expect.poll(() => altas).toBe(1);
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();

    // El estudio y el plan viajan en la metadata del usuario: es lo único que
    // hace que el alta sobreviva a confirmar el email desde OTRO dispositivo.
    // Sin esto la cuenta se crearía y el estudio no.
    const pendiente = (metadata as { pending_studio?: Record<string, unknown> } | null)?.pending_studio;
    expect(pendiente).toMatchObject({ nombre: 'Estudio Aurora', plan: 'ESTUDIO' });
  });

  test('elegir plan Base lo lleva hasta el final', async ({ page }) => {
    let metadata: Record<string, unknown> | null = null;
    await page.route('**/auth/v1/signup**', route => {
      metadata = (route.request().postDataJSON() as { data?: Record<string, unknown> })?.data ?? null;
      return json(route, ALTA_PENDIENTE_DE_EMAIL);
    });

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    await page.getByRole('radio', { name: /Plan Base/ }).click();
    await pasarDelPlan(page);
    await rellenarPaso3(page);
    await page.getByRole('button', { name: /días gratis/ }).click();

    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();
    const pendiente = (metadata as { pending_studio?: Record<string, unknown> } | null)?.pending_studio;
    expect(pendiente).toMatchObject({ plan: 'BASE' });
  });

  test('volver atrás conserva lo escrito, no lo borra', async ({ page }) => {
    await page.goto('/crear-estudio');
    await rellenarPaso1(page, 'Estudio Aurora');
    await pasarDelPlan(page);
    await rellenarPaso3(page);

    await page.getByRole('button', { name: 'Atrás' }).click();
    await page.getByRole('button', { name: 'Atrás' }).click();

    await expect(page.getByRole('heading', { name: 'Tu estudio' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre de tu estudio' })).toHaveValue('Estudio Aurora');
  });

  test('recargar a media faena recupera lo que había, menos la contraseña', async ({ page }) => {
    await page.goto('/crear-estudio');
    await rellenarPaso1(page, 'Estudio Aurora');
    await pasarDelPlan(page);
    await rellenarPaso3(page);

    await page.reload();

    await expect(page.getByText('Hemos recuperado lo que habías dejado a medias')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nombre de tu estudio' })).toHaveValue('Estudio Aurora');

    // ⚠️ La contraseña NO puede quedar guardada en disco: localStorage la lee
    // cualquier script de la página y sobrevive a cerrar el navegador.
    const guardado = await page.evaluate(() => localStorage.getItem('tentare:alta-borrador'));
    expect(guardado).not.toBeNull();
    expect(guardado).not.toContain('contrasena-larga');
    expect(JSON.parse(guardado!)).not.toHaveProperty('contrasena');
  });
});

test.describe('Cuando algo va mal', () => {
  test('sin nombre de estudio no deja pasar de paso', async ({ page }) => {
    await page.goto('/crear-estudio');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('Escribe el nombre de tu estudio.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu estudio' })).toBeVisible();
  });

  test('una contraseña corta se avisa aquí, sin gastar un viaje al servidor', async ({ page }) => {
    let altas = 0;
    await page.route('**/auth/v1/signup**', route => { altas += 1; return json(route, ALTA_PENDIENTE_DE_EMAIL); });

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    await pasarDelPlan(page);
    await page.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana');
    await page.getByRole('textbox', { name: 'Email' }).fill('ana@example.com');
    await page.getByRole('textbox', { name: 'Contraseña' }).fill('corta');
    await page.getByRole('button', { name: /días gratis/ }).click();

    await expect(page.getByText(/al menos 8 caracteres/)).toBeVisible();
    expect(altas, 'no debería haber llamado al servidor con una contraseña que ya sabemos inválida').toBe(0);
  });

  test('si el servidor dice que no, se dice — y NO se anuncia ningún éxito', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', route => {
      intentos += 1;
      return json(route, { code: 422, msg: 'Signup requires a valid password' }, 422);
    });

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    await pasarDelPlan(page);
    await rellenarPaso3(page);
    await page.getByRole('button', { name: /días gratis/ }).click();

    // El contador es lo que hace este test real: sin él, «no dijo éxito»
    // también sería cierto si el botón no hubiera enviado nada.
    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
  });

  test('con la red caída tampoco anuncia éxito', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', route => { intentos += 1; return route.abort('failed'); });

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    await pasarDelPlan(page);
    await rellenarPaso3(page);
    await page.getByRole('button', { name: /días gratis/ }).click();

    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toHaveCount(0);
    // Y el botón vuelve a estar disponible: un alta que falla y deja el botón
    // girando para siempre es un abandono garantizado.
    await expect(page.getByRole('button', { name: /días gratis/ })).toBeEnabled();
  });

  test('un email ya registrado no recibe un «revisa tu correo» que es mentira', async ({ page }) => {
    // gotrue responde 200 con un usuario fantasma (para no dejar enumerar
    // emails) y NO envía ningún correo. Sin este caso, la pantalla mandaba a
    // alguien a esperar un email que no existe.
    await page.route('**/auth/v1/signup**', route => json(route, EMAIL_YA_REGISTRADO));

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    await pasarDelPlan(page);
    await rellenarPaso3(page);
    await page.getByRole('button', { name: /días gratis/ }).click();

    await expect(page.getByText(/Ya hay una cuenta con este email/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toHaveCount(0);
  });
});

test.describe('En el móvil', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('los tres pasos caben y se puede llegar hasta el final', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE_DE_EMAIL));

    await page.goto('/crear-estudio');
    await rellenarPaso1(page);

    // Las tres tarjetas de plan se apilan; todas tienen que ser alcanzables.
    for (const plan of ['Plan Base', 'Plan Estudio', 'Plan Cadena']) {
      await expect(page.getByRole('radio', { name: new RegExp(plan) })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Continuar' }).click();

    await rellenarPaso3(page);
    const boton = page.getByRole('button', { name: /días gratis/ });
    await expect(boton).toBeVisible();
    await boton.click();
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();
  });

  test('la página no se desborda a lo ancho', async ({ page }) => {
    await page.goto('/crear-estudio');
    await rellenarPaso1(page);
    // El paso del plan es el más ancho (tres tarjetas): si algo se sale, es aquí.
    const desborda = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda, 'la pantalla del plan se sale a lo ancho en móvil').toBe(false);
  });
});
