import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El alta pública y el CÓDIGO de verificación.
//
// El bug que este fichero existe para impedir: la pantalla decía «te hemos
// enviado un enlace» y remataba con «Ir a iniciar sesión», pero el correo lleva
// un código de 6 dígitos (`supabase/templates/confirmation.html` pinta
// `{{ .Token }}` y no incluye botón). Quien se registraba recibía un código,
// no tenía dónde escribirlo, y solo terminaba el alta si adivinaba que /login
// sí tenía el campo. La interfaz y el correo contaban historias distintas.
//
// Por eso casi todas las comprobaciones de aquí son sobre lo que se le PROMETE
// a quien se registra, no solo sobre si la petición sale.
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Alta creada, falta el código: sin sesión pero con `identities`. */
const ALTA_PENDIENTE = {
  user: { id: 'u1', email: 'ana@example.com', identities: [{ id: 'i1' }] },
  session: null,
};

// ⚠️ El access_token tiene que tener FORMA de JWT. `supabase.auth.setSession()`
// lo decodifica para sacar la caducidad, y con una cadena cualquiera ni abre
// sesión ni avisa: el alta se quedaba en «no hemos podido abrir la sesión» y el
// test parecía decir que crear el estudio estaba roto. Va sin firma válida
// a propósito — aquí no verifica nadie, solo se decodifica.
const JWT_DE_MENTIRA =
  'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9'
  + '.eyJzdWIiOiAidTEiLCAiZW1haWwiOiAiYW5hQGV4YW1wbGUuY29tIiwgInJvbGUiOiAiYXV0aGVudGljYXRlZCIsICJhdWQiOiAiYXV0aGVudGljYXRlZCIsICJleHAiOiAxODE4Njg0MTk3LCAiaWF0IjogMTc4NzE0ODE5N30'
  + '.firma-de-mentira';

const SESION_OK = {
  ok: true,
  session: { access_token: JWT_DE_MENTIRA, refresh_token: 'tok-refresco' },
};

async function llegarAlCodigo(page: Page, email = 'ana@example.com') {
  await page.goto('/crear-estudio');
  await page.getByRole('textbox', { name: 'Nombre de tu estudio' }).fill('Estudio Aurora');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tu nombre' }).fill('Ana');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('contrasena-larga');
  await page.getByRole('button', { name: /días gratis/ }).click();
}

async function escribirCodigo(page: Page, codigo: string) {
  await page.getByRole('textbox', { name: 'Dígito 1 de 6' }).fill(codigo);
}

test.describe('Después de registrarse se pide el CÓDIGO, no un enlace', () => {
  test('⚠️ la pantalla pide el código y no menciona ningún enlace', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await llegarAlCodigo(page);

    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Código de verificación de 6 dígitos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verificar correo' })).toBeVisible();

    // El fallo original, fijado: ni «enlace» ni un desvío a /login para poder
    // terminar el propio registro.
    const texto = await page.locator('body').innerText();
    expect(texto, 'la pantalla no puede prometer un enlace: el correo lleva un código').not.toMatch(/enlace/i);
    await expect(page.getByRole('link', { name: /iniciar sesión/i })).toHaveCount(0);
  });

  test('enseña el email REAL que se escribió, no otro', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await llegarAlCodigo(page, 'maria@miestudio.com');
    // Sale dos veces a propósito: en la frase de arriba y dentro del componente.
    await expect(page.getByText('maria@miestudio.com').first()).toBeVisible();
    await expect(page.getByText('soporte@tentare.app')).toHaveCount(0);
  });

  test('código correcto: crea el estudio y NO manda a nadie a /login', async ({ page }) => {
    let creado = false;
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await page.route('**/api/auth/otp/verificar', route => json(route, SESION_OK));
    // ⚠️ Con un JWT que no puede validar, supabase-js intenta REFRESCAR la
    // sesión antes de nada. Sin este mock esa petición sale hacia
    // example.supabase.co, no vuelve nunca, y `getUser()` se queda colgado: la
    // pantalla no da error, simplemente no avanza. Costó encontrarlo porque el
    // síntoma («se queda en Verificado») parece un fallo del propio flujo.
    await page.route('**/auth/v1/token**', route => json(route, {
      access_token: JWT_DE_MENTIRA, refresh_token: 'tok-refresco', token_type: 'bearer', expires_in: 31536000,
      user: { id: 'u1', email: 'ana@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
    // Tras `setSession`, el cliente pide el usuario y luego inserta el estudio.
    await page.route('**/auth/v1/user**', route => json(route, {
      id: 'u1', email: 'ana@example.com', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    }));
    await page.route('**/rest/v1/**', route => json(route, []));
    // El alta pide un slug libre por RPC antes de insertar. Sin este mock la
    // respuesta genérica (`[]`) no es `true` y la búsqueda de slug se agota.
    await page.route('**/rest/v1/rpc/slug_estudio_disponible', route => json(route, true));
    await page.route('**/rest/v1/studios**', route => {
      if (route.request().method() === 'POST') { creado = true; return json(route, [{ id: 's1', slug: 'estudio-aurora' }], 201); }
      return json(route, []);
    });

    await llegarAlCodigo(page);
    await escribirCodigo(page, '123456');
    await page.getByRole('button', { name: 'Verificar correo' }).click();

    await expect.poll(() => creado, { timeout: 15_000 }).toBe(true);
    await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
  });
});

test.describe('Cuando el código no cuela', () => {
  test('código incorrecto: lo dice y deja reintentar, sin perder el sitio', async ({ page }) => {
    let intentos = 0;
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await page.route('**/api/auth/otp/verificar', route => {
      intentos += 1;
      return json(route, { error: 'El código no es correcto o ha caducado. Comprueba el código o solicita uno nuevo.', errorCode: 'INVALIDO' }, 400);
    });

    await llegarAlCodigo(page);
    await escribirCodigo(page, '000000');
    await page.getByRole('button', { name: 'Verificar correo' }).click();

    // Contador: sin él, «salió el error» también sería cierto si no se hubiera
    // llegado a llamar al servidor.
    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByText(/no es correcto o ha caducado/)).toBeVisible();
    // Sigue en la pantalla del código, con el campo listo para reintentar.
    await expect(page.getByRole('group', { name: 'Código de verificación de 6 dígitos' })).toBeVisible();
  });

  test('demasiados intentos: lo dice y bloquea el botón', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await page.route('**/api/auth/otp/verificar', route =>
      json(route, { error: 'Demasiados intentos. Solicita un código nuevo en unos minutos.', errorCode: 'DEMASIADOS_INTENTOS' }, 429));

    await llegarAlCodigo(page);
    await escribirCodigo(page, '111111');
    await page.getByRole('button', { name: 'Verificar correo' }).click();

    await expect(page.getByText(/Demasiados intentos/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verificar correo' })).toBeDisabled();
  });

  test('reenviar el código: se pide de verdad y arranca la cuenta atrás', async ({ page }) => {
    let reenvios = 0;
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await page.route('**/auth/v1/resend**', route => { reenvios += 1; return json(route, {}); });

    await llegarAlCodigo(page);
    await page.getByRole('button', { name: /Reenviar código/ }).click();

    await expect.poll(() => reenvios).toBeGreaterThan(0);
    // La cuenta atrás refleja el cooldown real del servidor (60 s), así que
    // desaparece el botón y aparece el contador.
    await expect(page.getByText(/Reenviar código en/)).toBeVisible();
  });

  test('cambiar de email: vuelve al paso de la cuenta con TODO lo escrito', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await llegarAlCodigo(page);

    await page.getByRole('button', { name: 'Cambiar correo' })
      .or(page.getByRole('button', { name: /correo/i }).last()).click();

    await expect(page.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
    // Nada de volver a empezar: el estudio y el nombre siguen ahí.
    await expect(page.getByRole('textbox', { name: 'Tu nombre' })).toHaveValue('Ana');
    await page.getByRole('button', { name: 'Atrás' }).click();
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.getByRole('textbox', { name: 'Nombre de tu estudio' })).toHaveValue('Estudio Aurora');
  });

  test('recargar durante la verificación NO devuelve al formulario', async ({ page }) => {
    // La cuenta YA existe y el correo YA se ha enviado: mandar a alguien de
    // vuelta al paso 1 le haría intentar registrarse otra vez con un email que
    // gotrue ya tiene, y acabaría en «ya hay una cuenta».
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await llegarAlCodigo(page);
    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: /Escribe el código/ })).toBeVisible();
    await expect(page.getByText('ana@example.com').first()).toBeVisible();
  });

  test('email ya registrado: no se promete ningún código', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route =>
      json(route, { user: { id: 'u0', email: 'ana@example.com', identities: [] }, session: null }));

    await llegarAlCodigo(page);
    await expect(page.getByText(/Ya hay una cuenta con este email/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Código de verificación de 6 dígitos' })).toHaveCount(0);
  });
});

test.describe('En el móvil', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('la pantalla del código cabe y se puede escribir', async ({ page }) => {
    await page.route('**/auth/v1/signup**', route => json(route, ALTA_PENDIENTE));
    await llegarAlCodigo(page);

    await expect(page.getByRole('group', { name: 'Código de verificación de 6 dígitos' })).toBeVisible();
    await escribirCodigo(page, '123456');
    await expect(page.getByRole('button', { name: 'Verificar correo' })).toBeEnabled();

    const desborda = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda, 'la pantalla del código se sale a lo ancho en móvil').toBe(false);
  });
});
