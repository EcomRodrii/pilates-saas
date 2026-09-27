import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Widget «Formulario de contacto» (lib/widgets/catalogo.ts): la vista
// `tab=contacto` de /reservar, incrustada y a página completa.
//
// Lo que se vigila:
//  - incrustado es de un solo propósito (sin horario, bonos ni pie);
//  - lo que se manda: los campos, la privacidad aceptada y la trampa vacía;
//  - ⚠️ un 400/429/503 o la red caída NUNCA se anuncian como enviado, y lo
//    escrito no se pierde (todo camino de fallo lleva contador de intentos:
//    [[test-4xx-necesita-contador-de-intentos]]);
//  - sin casilla de privacidad, en la vista previa del panel, o sin captcha
//    comprobable en el servidor, no se intenta nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const SLUG = 'tentare';
const S = 'studio-test';

function fx() {
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12,
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'p-bono', studioId: S, tipo: 'BONO', activo: true, precio: 100, nombre: 'Bono 10 clases', sesiones: 10 }],
    sesiones: [{ id: 's1', studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [],
    challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

type Respuesta = { status: number; body: unknown } | 'red';

async function abrir(page: Page, query: string, o: { disponible?: boolean } = {}) {
  // Sin reloj simulado a propósito: el formulario no depende de la hora, y con
  // una fecha falsa el Turnstile real (si hay clave en local) falla con 200100.
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  let intentos = 0;
  let cuerpo: Record<string, unknown> = {};
  let respuesta: Respuesta = { status: 201, body: { ok: true } };
  await page.route('**/api/public/contacto', r => {
    if (r.request().method() === 'GET') {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ disponible: o.disponible ?? true }) });
    }
    intentos += 1;
    cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    if (respuesta === 'red') return r.abort('failed');
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
  });
  for (let i = 0; i < 3; i++) {
    await page.goto(`/reservar/${SLUG}?${query}`);
    if (await page.getByRole('heading', { name: '¿Tienes alguna duda?' }).waitFor({ timeout: 40_000 }).then(() => true, () => false)) break;
  }
  return {
    intentos: () => intentos,
    cuerpo: () => cuerpo,
    responder: (r: Respuesta) => { respuesta = r; },
  };
}

async function rellenar(page: Page, o: { privacidad?: boolean } = {}) {
  await page.getByLabel('Nombre', { exact: true }).fill('Nueva Visitante');
  await page.getByLabel('Email', { exact: true }).fill('nueva@example.com');
  await page.getByLabel(/Teléfono/).fill('+34 611 222 333');
  await page.getByLabel('Mensaje').fill('¿Tenéis clases para principiantes por la tarde?');
  if (o.privacidad !== false) await page.getByRole('checkbox', { name: /información sobre privacidad/ }).check();
}

test('incrustado: el formulario y nada más (ni horario, ni bonos, ni pie)', async ({ page }) => {
  await abrir(page, 'embed=1&tab=contacto&ref=web-contacto');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reformer a las/ })).toHaveCount(0);
  await expect(page.locator('#bonos-membresias')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
  // La información de privacidad, antes de enviar y con el nombre del estudio.
  await expect(page.getByText(/Responsable: Estudio Alma/)).toBeVisible();
  // Sin foto propia, la de por defecto: el formulario nunca sale sobre un hueco.
  await expect(page.locator('.contacto-foto')).toHaveAttribute('src', /por-defecto/);
  await expect(page.getByPlaceholder('tu@email.com')).toBeVisible();
});

test('en el móvil la foto es una banda arriba; con sitio, el fondo de la tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page, 'embed=1&tab=contacto');
  const foto = page.locator('.contacto-foto');
  const tarjeta = page.locator('.contacto-tarjeta');
  // Estrecho: la tarjeta empieza donde acaba la banda (menos la esquina que la pisa).
  await expect.poll(async () => {
    const [f, t] = [await foto.boundingBox(), await tarjeta.boundingBox()];
    return !!f && !!t && t.y >= f.y + f.height - 30 && f.height < 220;
  }).toBe(true);
  // Ancho: la foto ocupa todo el marco y la tarjeta va encima, dentro de ella.
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect.poll(async () => {
    const [f, t] = [await foto.boundingBox(), await tarjeta.boundingBox()];
    return !!f && !!t && t.y > f.y && t.y + t.height < f.y + f.height && t.x > f.x && t.x + t.width < f.x + f.width;
  }).toBe(true);
});

test('página completa (enlace o botón): el formulario, con el pie y sus textos legales', async ({ page }) => {
  await abrir(page, 'tab=contacto&ref=web-contacto');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toBeVisible();
  await expect(page.locator('footer')).toHaveCount(1);
});

test('enviar: manda los campos con la privacidad aceptada y la etiqueta, y lo dice', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto&ref=web-contacto');
  await rellenar(page);
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect.poll(api.intentos, { timeout: 15_000 }).toBe(1);
  expect(api.cuerpo()).toMatchObject({
    slug: SLUG, nombre: 'Nueva Visitante', email: 'nueva@example.com', telefono: '+34 611 222 333',
    aceptaPrivacidad: true, origen: 'web-contacto', web: '',
  });
  await expect(page.getByRole('heading', { name: 'Gracias, Nueva' })).toBeVisible();
  await expect(page.getByText('nueva@example.com')).toBeVisible();
});

for (const [nombre, fallo, texto] of [
  ['un 400', { status: 400, body: { error: 'El teléfono no parece válido.' } }, 'El teléfono no parece válido.'],
  ['un 429', { status: 429, body: { error: 'Ya has enviado varios mensajes hoy. El estudio te responderá en cuanto pueda.' } }, 'Ya has enviado varios mensajes hoy'],
  ['un 503', { status: 503, body: { error: 'x' } }, 'No hemos podido enviar tu mensaje.'],
  ['la red caída', 'red', 'Revisa tu conexión'],
] as const) {
  test(`⚠️ ${nombre}: no se anuncia como enviado y lo escrito sigue ahí`, async ({ page }) => {
    const api = await abrir(page, 'embed=1&tab=contacto');
    api.responder(fallo as Respuesta);
    await rellenar(page);
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect.poll(api.intentos, { timeout: 15_000 }).toBeGreaterThan(0);
    // Filtrado: el anunciador de rutas de Next también es un role="alert".
    await expect(page.getByRole('alert').filter({ hasText: texto })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Gracias/ })).toHaveCount(0);
    await expect(page.getByLabel('Mensaje')).toHaveValue('¿Tenéis clases para principiantes por la tarde?');
  });
}

test('sin rellenar nada: dice qué falta, lleva al primer campo y no se intenta enviar', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Faltan tu nombre, tu email y el mensaje.' })).toBeVisible();
  const nombre = page.getByLabel('Nombre', { exact: true });
  await expect(nombre).toBeFocused();
  await expect(nombre).toHaveAttribute('aria-invalid', 'true');
  // Se desmarca al escribir, sin esperar a otro intento.
  await nombre.fill('Nueva');
  await expect(nombre).toHaveAttribute('aria-invalid', 'false');
  expect(api.intentos()).toBe(0);
});

test('email con errata: se dice antes de enviar, sin gastar el captcha', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto');
  await rellenar(page);
  await page.getByLabel('Email', { exact: true }).fill('nueva@example');
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Escribe un email válido' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  expect(api.intentos()).toBe(0);
});

test('sin marcar la privacidad no se intenta enviar', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto');
  await rellenar(page, { privacidad: false });
  await page.getByRole('button', { name: 'Enviar mensaje' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'privacidad' })).toBeVisible();
  expect(api.intentos()).toBe(0);
});

test('en la vista previa del panel no se envía nada', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto&vista-previa=1');
  const boton = page.getByRole('button', { name: 'En la vista previa no se envía' });
  await expect(boton).toBeDisabled();
  expect(api.intentos()).toBe(0);
});

test('sin captcha comprobable en el servidor: el contacto del estudio, no un formulario que nunca envía', async ({ page }) => {
  const api = await abrir(page, 'embed=1&tab=contacto', { disponible: false });
  await expect(page.getByText(/El formulario no está disponible ahora mismo/)).toBeVisible();
  await expect(page.getByText(/hola@example\.com/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'hola@example.com' })).toHaveAttribute('href', 'mailto:hola@example.com');
  await expect(page.getByRole('link', { name: '+34 600 000 000' })).toHaveAttribute('href', 'tel:+34600000000');
  await expect(page.getByRole('button', { name: 'Enviar mensaje' })).toHaveCount(0);
  expect(api.intentos()).toBe(0);
});
