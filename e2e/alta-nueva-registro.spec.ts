import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El alta nueva: registro en una pantalla y el código en el asunto (PR-2,
// app/crear-estudio/alta-nueva.tsx). El servidor de e2e arranca con
// ALTA_NUEVA_REGISTRO=prueba (playwright.config.ts): el alta nueva solo sale con
// `?alta=nueva`, y sin el parámetro tiene que salir la de siempre, idéntica
// (sus specs, alta-estudio y alta-otp, siguen pasando por ahí).
//
// gotrue va mockeado con `page.route`. ⚠️ Los caminos de fallo llevan CONTADOR
// de peticiones: «no anunció éxito» también sería verdad si el formulario no
// hubiera llegado a enviar nada (.claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

const ALTA = '/crear-estudio?alta=nueva';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Cuenta creada, falta el código: sin sesión pero con `identities`. */
const ALTA_PENDIENTE = { user: { id: 'u1', email: 'prueba-tentare@example.com', identities: [{ id: 'i1' }] }, session: null };
/** El usuario fantasma de gotrue cuando el email YA tiene cuenta: no se manda nada. */
const YA_REGISTRADO = { user: { id: 'u0', email: 'prueba-tentare@example.com', identities: [] }, session: null };

// Con forma de JWT: `setSession()` lo decodifica (ver e2e/alta-otp.spec.ts).
const JWT_DE_MENTIRA =
  'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9'
  + '.eyJzdWIiOiAidTEiLCAiZW1haWwiOiAiYW5hQGV4YW1wbGUuY29tIiwgInJvbGUiOiAiYXV0aGVudGljYXRlZCIsICJhdWQiOiAiYXV0aGVudGljYXRlZCIsICJleHAiOiAxODE4Njg0MTk3LCAiaWF0IjogMTc4NzE0ODE5N30'
  + '.firma-de-mentira';
const USUARIO = {
  id: 'u1', email: 'prueba-tentare@example.com', aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

const nombre = (page: Page) => page.getByRole('textbox', { name: 'Nombre de tu estudio' });
const email = (page: Page) => page.getByRole('textbox', { name: 'Tu email' });
const contrasena = (page: Page) => page.getByLabel('Contraseña', { exact: true });
const crear = (page: Page) => page.getByRole('button', { name: 'Crear mi estudio' });

/**
 * Escribe el nombre hasta que React lo tiene: la dirección de su página solo
 * cambia si el estado cambió. Antes de hidratar, el campo existe y acepta lo
 * escrito, pero React lo devuelve a vacío al tomar el control (e2e/alta-paso1.ts).
 */
async function escribirNombre(page: Page, texto = 'Estudio Alba') {
  // Los nombres de aquí no llevan tildes: basta con esto para saber qué dirección sale.
  const slug = texto.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await expect(async () => {
    await nombre(page).fill(texto);
    await expect(page.getByTestId('direccion-prevista')).toHaveText(`tentare.app/reservar/${slug}`, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function rellenarTodo(page: Page, correo = 'prueba-tentare@example.com') {
  await escribirNombre(page);
  await email(page).fill(correo);
  await contrasena(page).fill('mi perro come peras');
}

/** Lo de alrededor del alta que no se prueba aquí: que no salga a la red de verdad. */
async function silenciarApi(page: Page) {
  await page.route('**/api/alta/**', (route) => json(route, { ok: true }));
}

test.describe('Sin ?alta=nueva, el alta de siempre', () => {
  test('con el interruptor en «prueba», /crear-estudio a secas es la de tres pasos', async ({ page }) => {
    await page.goto('/crear-estudio');
    await expect(page.getByRole('heading', { name: 'Tu estudio' })).toBeVisible();
    await expect(page.getByLabel('Paso 1 de 3')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Crea tu estudio en Tentare' })).toHaveCount(0);
  });

  test('con ?alta=nueva, la nueva: una pantalla con los tres campos', async ({ page }) => {
    await page.goto(ALTA);
    await expect(page.getByRole('heading', { name: 'Crea tu estudio en Tentare' })).toBeVisible();
    await expect(page.getByText('Paso 1 de 7 · unos 2 minutos')).toBeVisible();
    await expect(nombre(page)).toBeVisible();
    await expect(email(page)).toBeVisible();
    await expect(contrasena(page)).toBeVisible();
    // Ni plan que elegir ni «¿Cómo conociste Tentare?».
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByText('¿Cómo conociste Tentare?')).toHaveCount(0);
    // La línea legal, con sus dos enlaces.
    await expect(page.getByRole('link', { name: 'condiciones de uso' })).toHaveAttribute('href', '/terminos');
    await expect(page.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute('href', '/privacidad');
    await expect(page.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
  });
});

test.describe('Validación en línea, campo a campo', () => {
  test('al salir de cada campo dice qué falta, y mientras escribe se corrige solo', async ({ page }) => {
    let altas = 0;
    await page.route('**/auth/v1/signup**', (route) => { altas += 1; return json(route, ALTA_PENDIENTE); });
    await page.goto(ALTA);
    await escribirNombre(page, 'E');
    await expect(page.getByTestId('direccion-prevista')).toHaveText('tentare.app/reservar/e');

    // Antes de salir del campo no se le riñe a nadie.
    await expect(page.getByText('Escribe el nombre de tu estudio: al menos 2 letras.')).toHaveCount(0);
    await email(page).focus();
    await expect(page.getByText('Escribe el nombre de tu estudio: al menos 2 letras.')).toBeVisible();
    await expect(nombre(page)).toHaveAttribute('aria-invalid', 'true');

    // Tras el primer error, se corrige mientras escribe.
    await nombre(page).fill('Estudio Alba');
    await expect(page.getByText('Escribe el nombre de tu estudio: al menos 2 letras.')).toHaveCount(0);
    await expect(page.getByTestId('direccion-prevista')).toHaveText('tentare.app/reservar/estudio-alba');
    // No se promete la dirección exacta: `dbCreateStudio` puede sumarle un número.
    await expect(page.getByText('Si otro estudio ya la tiene, le añadimos un número al final.')).toBeVisible();

    await email(page).fill('lucia');
    await contrasena(page).focus();
    await expect(page.getByText('A este email le falta algo. Revisa la @ y el final, como en nombre@example.com.')).toBeVisible();
    await email(page).fill('prueba-tentare@example.com');
    await expect(page.getByText(/A este email le falta algo/)).toHaveCount(0);

    await contrasena(page).fill('1234');
    await nombre(page).focus();
    await expect(page.getByText('Usa 8 caracteres o más.')).toBeVisible();
    await contrasena(page).fill('12345678');
    await expect(page.getByText('Es fácil de adivinar. Prueba con una frase corta que recuerdes.')).toBeVisible();
    await contrasena(page).fill('EstudioAlba2026');
    await expect(page.getByText(/Es fácil de adivinar/)).toBeVisible();
    await contrasena(page).fill('mi perro come peras');
    await expect(page.getByText(/Es fácil de adivinar|Usa 8 caracteres/)).toHaveCount(0);
    expect(altas, 'validar no gasta viajes al servidor').toBe(0);
  });

  test('pulsar con algo mal no envía nada y lleva el foco al primer campo que arreglar', async ({ page }) => {
    let altas = 0;
    await page.route('**/auth/v1/signup**', (route) => { altas += 1; return json(route, ALTA_PENDIENTE); });
    await page.goto(ALTA);
    await escribirNombre(page);
    await email(page).fill('prueba-tentare@');
    await contrasena(page).fill('corta');
    await crear(page).click();

    await expect(email(page)).toBeFocused();
    await expect(page.getByText(/A este email le falta algo/)).toBeVisible();
    await expect(page.getByText('Usa 8 caracteres o más.')).toBeVisible();
    await page.waitForTimeout(300);
    expect(altas, 'con un campo mal no se llama a gotrue').toBe(0);
  });

  test('«¿Querías decir…?» sugiere el dominio bueno y solo lo cambia si se pide', async ({ page }) => {
    await page.goto(ALTA);
    await escribirNombre(page);
    await email(page).fill('prueba-tentare.alba@gmial.com');
    await contrasena(page).focus();

    const sugerencia = page.getByText('¿Querías decir');
    await expect(sugerencia).toContainText('prueba-tentare.alba@gmail.com');
    // Sugerir no es cambiar: lo escrito sigue ahí hasta que se pulsa.
    await expect(email(page)).toHaveValue('prueba-tentare.alba@gmial.com');
    await page.getByRole('button', { name: 'Sí, cámbialo' }).click();
    await expect(email(page)).toHaveValue('prueba-tentare.alba@gmail.com');
    await expect(sugerencia).toHaveCount(0);
  });
});

test.describe('Lo que dice gotrue', () => {
  test('se crea la cuenta: la metadata lleva el alta nueva y no lleva a la persona', async ({ page }) => {
    let metadata: Record<string, unknown> | null = null;
    let altas = 0;
    await silenciarApi(page);
    await page.route('**/auth/v1/signup**', (route) => {
      altas += 1;
      metadata = (route.request().postDataJSON() as { data?: Record<string, unknown> })?.data ?? null;
      return json(route, ALTA_PENDIENTE);
    });
    await page.goto(ALTA);
    await rellenarTodo(page);
    await crear(page).click();

    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByText('Paso 2 de 7 · menos de 1 minuto')).toBeVisible();
    await expect(page.getByText('prueba-tentare@example.com')).toBeVisible();
    await expect(page.getByText(/Mira en Promociones o en Spam/)).toBeVisible();
    expect(altas).toBe(1);
    // `alta_nueva` PLANA (la lee la plantilla del correo); el estudio en
    // `pending_studio`, con la versión del alta y la de los textos legales.
    expect(metadata).toMatchObject({
      alta_nueva: true,
      pending_studio: { nombre: 'Estudio Alba', plan: 'BASE', version: 'v2_prueba' },
    });
    const pendiente = (metadata as unknown as { pending_studio: Record<string, unknown> }).pending_studio;
    expect(pendiente.condiciones_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(metadata).not.toHaveProperty('nombre');
    expect(pendiente).not.toHaveProperty('ciudad');
  });

  test('un 4xx: lo dice, no anuncia ningún código y deja volver a intentarlo', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', (route) => {
      intentos += 1;
      return json(route, {
        code: 422, error_code: 'weak_password',
        msg: 'Password is known to be weak and easy to guess, please choose a different one.',
        weak_password: { reasons: ['pwned'] },
      }, 422);
    });
    await page.goto(ALTA);
    await rellenarTodo(page);
    await crear(page).click();

    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByText(/filtraciones de datos/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toHaveCount(0);
    await expect(crear(page)).toBeEnabled();
  });

  test('un 5xx: tampoco anuncia éxito', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', (route) => {
      intentos += 1;
      return json(route, { code: 500, msg: 'Error sending confirmation email' }, 500);
    });
    await page.goto(ALTA);
    await rellenarTodo(page);
    await crear(page).click();

    await expect.poll(() => intentos).toBeGreaterThan(0);
    // Dicho en castellano y con salida: nunca el «{}» o el inglés crudo de gotrue.
    await expect(page.getByText(/No hemos podido (crear tu cuenta|mandarte el código)/)).toBeVisible();
    await expect(page.getByText('{}', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Error sending/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toHaveCount(0);
    await expect(crear(page)).toBeEnabled();
  });

  test('un email ya registrado no recibe un «revisa tu correo» que es mentira', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', (route) => { intentos += 1; return json(route, YA_REGISTRADO); });
    await page.goto(ALTA);
    await rellenarTodo(page);
    await crear(page).click();

    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByText(/Ya hay una cuenta con este email/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toHaveCount(0);
  });
});

test.describe('El código y el estudio', () => {
  async function hastaElCodigo(page: Page) {
    await silenciarApi(page);
    await page.route('**/auth/v1/signup**', (route) => json(route, ALTA_PENDIENTE));
    await page.goto(ALTA);
    await rellenarTodo(page);
    await crear(page).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  }

  async function montarConSesion(page: Page, opts: { primerIntentoFalla: boolean }) {
    const cuentas = { estudios: 0, correos: 0 };
    await page.route('**/api/auth/otp/verificar', (route) =>
      json(route, { ok: true, session: { access_token: JWT_DE_MENTIRA, refresh_token: 'tok-refresco' } }));
    await page.route('**/auth/v1/token**', (route) => json(route, {
      access_token: JWT_DE_MENTIRA, refresh_token: 'tok-refresco', token_type: 'bearer', expires_in: 31536000, user: USUARIO,
    }));
    await page.route('**/auth/v1/user**', (route) => json(route, USUARIO));
    await page.route('**/rest/v1/**', (route) => json(route, []));
    await page.route('**/rest/v1/rpc/slug_estudio_disponible', (route) => json(route, true));
    await page.route('**/rest/v1/studios**', (route) => {
      if (route.request().method() !== 'POST') return json(route, []);
      cuentas.estudios += 1;
      // Un error que `dbCreateStudio` NO reintenta por dentro: falla a la primera.
      if (opts.primerIntentoFalla && cuentas.estudios === 1) {
        return json(route, { code: '55000', message: 'object not in prerequisite state' }, 500);
      }
      return json(route, [{ id: 's1', slug: 'estudio-alba' }], 201);
    });
    await page.route('**/api/alta/estudio-creado', (route) => { cuentas.correos += 1; return json(route, { ok: true, enviado: true }); });
    return cuentas;
  }

  test('código erróneo: lo dice, deja reintentar y no monta nada', async ({ page }) => {
    let intentos = 0;
    let estudios = 0;
    await hastaElCodigo(page);
    await page.route('**/api/auth/otp/verificar', (route) => {
      intentos += 1;
      return json(route, { error: 'El código no es correcto o ha caducado. Comprueba el código o solicita uno nuevo.', errorCode: 'INVALIDO' }, 400);
    });
    await page.route('**/rest/v1/studios**', (route) => { estudios += 1; return json(route, []); });

    // Con la sexta cifra se comprueba sola: sin pulsar «Verificar».
    await page.getByRole('textbox', { name: 'Dígito 1 de 6' }).fill('000000');
    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByText(/no es correcto o ha caducado/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Código de verificación de 6 dígitos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /ya existe/ })).toHaveCount(0);
    expect(estudios, 'sin código bueno no se monta ningún estudio').toBe(0);
  });

  test('si montar el estudio falla: «Reintentar ahora», y a la segunda «… ya existe»', async ({ page }) => {
    await hastaElCodigo(page);
    const cuentas = await montarConSesion(page, { primerIntentoFalla: true });
    await page.getByRole('textbox', { name: 'Dígito 1 de 6' }).fill('123456');

    await expect(page.getByText(/no hemos podido montar el estudio todavía/i)).toBeVisible({ timeout: 15_000 });
    expect(cuentas.estudios, 'se intentó de verdad').toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: /ya existe/ })).toHaveCount(0);
    expect(cuentas.correos, '«Tu cuenta está activa» solo con el estudio montado').toBe(0);

    await page.getByRole('button', { name: 'Reintentar ahora' }).click();
    await expect(page.getByRole('heading', { name: 'Estudio Alba ya existe' })).toBeVisible({ timeout: 15_000 });
    expect(cuentas.estudios).toBe(2);
  });

  test('éxito: «… ya existe», lo que viene después y el correo 2 pedido una vez', async ({ page }) => {
    await hastaElCodigo(page);
    const cuentas = await montarConSesion(page, { primerIntentoFalla: false });
    await page.getByRole('textbox', { name: 'Dígito 1 de 6' }).fill('123456');

    await expect(page.getByRole('heading', { name: 'Estudio Alba ya existe' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Código correcto')).toBeVisible();
    for (const paso of ['Dónde está y cuándo abre', 'Tus datos y tu marca', 'Tu primera clase, con su precio']) {
      await expect(page.getByText(paso)).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Configurar mi estudio' })).toHaveAttribute('href', '/dashboard');
    await expect(page.getByRole('link', { name: 'Prefiero ir a mi panel' })).toHaveAttribute('href', '/dashboard');
    expect(cuentas.estudios).toBe(1);
    await expect.poll(() => cuentas.correos).toBe(1);
    // El borrador se olvida con el estudio montado.
    expect(await page.evaluate(() => localStorage.getItem('tentare:alta-nueva-borrador'))).toBeNull();
  });
});

test.describe('Recargar y el móvil', () => {
  test('recargar recupera el nombre y el email, nunca la contraseña', async ({ page }) => {
    await page.goto(ALTA);
    await rellenarTodo(page);
    await page.reload();

    await expect(page.getByText('Hemos recuperado lo que habías dejado a medias.')).toBeVisible();
    await expect(nombre(page)).toHaveValue('Estudio Alba');
    await expect(email(page)).toHaveValue('prueba-tentare@example.com');
    await expect(contrasena(page)).toHaveValue('');
    const guardado = await page.evaluate(() => localStorage.getItem('tentare:alta-nueva-borrador'));
    expect(guardado).not.toBeNull();
    expect(guardado).not.toContain('mi perro come peras');
  });

  test('a 375 px no se sale a lo ancho', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ALTA);
    await escribirNombre(page);
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda, 'el alta nueva se sale a lo ancho en el móvil').toBe(false);
  });
});
