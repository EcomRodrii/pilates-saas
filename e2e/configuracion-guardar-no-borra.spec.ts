import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Guardar una cosa en Configuración no puede borrar lo que estabas escribiendo
// en otra.
//
// Cada formulario de Estudio copia `studio` en su estado local y lo volvía a
// copiar ENTERO cada vez que `studio` cambiaba de referencia. `updateStudio`
// siempre crea un objeto nuevo, así que cualquier guardado —elegir el IVA,
// pegar el logo, guardar la política de devoluciones— reiniciaba los campos de
// al lado: el NIF a medio escribir, los datos SEPA… sin avisar.
//
// Todos los caminos de fallo cuentan intentos: «no dijo Guardado» también sería
// verdad con un botón que no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Un DNI de ejemplo con la letra de control bien puesta: el formulario no deja
// guardar un NIF que no cuadra.
const NIF = '12345678Z';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  iva_por_defecto: 21, reembolsos_activos: false, reembolso_plazo_dias: 14,
  reembolso_solo_sin_usar: true, penalizacion_importe_eur: null,
};

type Respuesta = 'ok' | 'cero-filas' | '403' | 'abort';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(
  page: Page,
  ruta: string,
  opts: { fila?: Record<string, unknown>; respuesta?: Respuesta; retrasoMs?: number } = {},
) {
  const patches: Record<string, unknown>[] = [];
  const { fila = STUDIO_ROW, respuesta = 'ok', retrasoMs = 0 } = opts;

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', async route => {
    if (route.request().method() !== 'PATCH') return json(route, fila);
    patches.push(route.request().postDataJSON() as Record<string, unknown>);
    if (retrasoMs) await new Promise(r => setTimeout(r, retrasoMs));
    if (respuesta === 'abort') return route.abort('failed');
    if (respuesta === '403') {
      return json(route, { code: '42501', message: 'permission denied for table studios' }, 403);
    }
    // Lo que devuelve PostgREST con `select=id`; `[]` es «la RLS no casó».
    return json(route, respuesta === 'cero-filas' ? [] : [{ id: STUDIO_ID }]);
  });

  await page.goto(ruta);
  return { patches };
}

// ─── Datos del estudio: tres formularios, cada uno con lo suyo ──────────────
//
// Hasta el 15-sep eran UN formulario («Guardar datos del estudio») que mandaba
// diecisiete campos a la vez. Partido en tres secciones, cada «Guardar» manda
// SOLO los campos de su tarjeta: si mandara los de otra, pisaría con lo que
// tenía en memoria lo que se hubiera guardado después.

// Mi estudio en filas con su cajón (15-sep, v2): los siete campos de «Datos y
// contacto» son dos cajones, y cada «Guardar» manda solo los suyos.
const NOMBRE_Y_DIRECCION = ['ciudad', 'codigo_postal', 'direccion', 'nombre'];
const CONTACTO = ['email', 'sitio_web', 'telefono'];
const FISCALES = ['iva_por_defecto', 'nif', 'razon_social'];
const TEXTOS = ['anio_fundacion', 'descripcion', 'frase_heroe', 'frase_manuscrita', 'lema', 'normas_texto', 'subtitulo_heroe'];

test.describe('Datos del estudio: guardar una cosa no borra ni manda otra', () => {
  // Cobros y facturas en filas con su cajón (15-sep, v2): `#datos-fiscales` lo abre.
  test('elegir el IVA no borra el NIF, pregunta antes, y Guardar manda los dos y nada más', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#datos-fiscales', {
      fila: { ...STUDIO_ROW, razon_social: 'Guardada SL', lema: 'Lema guardado', telefono: '600000000' },
    });

    const nif = page.getByRole('textbox', { name: 'NIF / CIF' });
    await expect(nif).toBeVisible({ timeout: 30_000 });
    await nif.fill(NIF);
    await page.getByRole('combobox', { name: 'IVA general' }).selectOption('10');

    // Margen para que un guardado instantáneo, si lo hubiera, vuelva y repinte.
    await page.waitForTimeout(800);
    expect(patches).toHaveLength(0);
    await expect(nif).toHaveValue(NIF);

    // El IVA es dinero: primero la pregunta, y hasta confirmar no sale nada.
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    const pregunta = page.getByRole('dialog', { name: '¿Cambiar el IVA al 10 %?' });
    await expect(pregunta).toBeVisible();
    expect(patches).toHaveLength(0);
    await pregunta.getByRole('button', { name: 'Sí, cambiar el IVA' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ nif: NIF, iva_por_defecto: 10, razon_social: 'Guardada SL' });
    expect(Object.keys(patches.at(-1)!).sort()).toEqual(FISCALES);
    await expect(page.getByText('Datos fiscales guardados')).toBeVisible();
    // Guardado de verdad: el cajón se cierra, y con él la barra.
    await expect(page.getByText(/Cambios sin guardar en/)).toHaveCount(0);
  });

  test('guardar el contacto manda solo esos tres campos', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio#contacto', {
      fila: { ...STUDIO_ROW, nif: NIF, lema: 'Lema guardado', ciudad: 'Almería' },
    });

    const telefono = page.getByRole('textbox', { name: 'Teléfono' });
    await expect(telefono).toBeVisible({ timeout: 30_000 });
    await telefono.fill('600111222');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ telefono: '600111222', email: 'carmen@example.com' });
    expect(Object.keys(patches.at(-1)!).sort()).toEqual(CONTACTO);
    await expect(page.getByText('Contacto guardado')).toBeVisible();
  });

  test('guardar nombre y dirección manda solo esos cuatro campos', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio#nombre-y-direccion', {
      fila: { ...STUDIO_ROW, nif: NIF, telefono: '600000000' },
    });

    const ciudad = page.getByRole('textbox', { name: 'Ciudad' });
    await expect(ciudad).toBeVisible({ timeout: 30_000 });
    await ciudad.fill('Almería');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ ciudad: 'Almería', nombre: 'Studio Carmen' });
    expect(Object.keys(patches.at(-1)!).sort()).toEqual(NOMBRE_Y_DIRECCION);
    await expect(page.getByText('Nombre y dirección guardados')).toBeVisible();
  });

  test('guardar los textos de tu app manda solo los textos', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=marca', {
      fila: { ...STUDIO_ROW, nif: NIF, razon_social: 'Guardada SL' },
    });

    const lema = page.getByRole('textbox', { name: 'Tu lema' });
    await expect(lema).toBeVisible({ timeout: 30_000 });
    await lema.fill('Cuerpo y mente');
    await page.getByRole('button', { name: 'Guardar textos de tu app' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ lema: 'Cuerpo y mente' });
    expect(Object.keys(patches.at(-1)!).sort()).toEqual(TEXTOS);
    await expect(page.getByText('Textos de tu app guardados')).toBeVisible();
  });

  test('pegar el logo no borra los textos a medio escribir, y solo manda el logo', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=marca');

    const lema = page.getByRole('textbox', { name: 'Tu lema' });
    await expect(lema).toBeVisible({ timeout: 30_000 });
    await lema.fill('Cuerpo y mente');

    await page.getByRole('button', { name: 'o pegar un enlace' }).first().click();
    await page.getByRole('textbox', { name: 'Enlace de logo' }).fill('https://example.com/logo.png');
    await page.getByRole('button', { name: 'Usar este enlace' }).click();

    // El logo se guarda solo, y tiene que haber salido de verdad.
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toEqual({ logo_url: 'https://example.com/logo.png' });
    await expect(page.getByText('Logo actualizado')).toBeVisible();

    await expect(lema).toHaveValue('Cuerpo y mente');
    await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
  });

  for (const respuesta of ['cero-filas', '403', 'abort'] as const) {
    test(`si el servidor dice que no (${respuesta}), no dice «guardados» y no pierde nada`, async ({ page }) => {
      const { patches } = await montar(page, '/configuracion?tab=cobros#datos-fiscales', { respuesta });

      const nif = page.getByRole('textbox', { name: 'NIF / CIF' });
      await expect(nif).toBeVisible({ timeout: 30_000 });
      await nif.fill(NIF);
      await page.getByRole('button', { name: 'Guardar', exact: true }).click();

      await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
      // Tiempo para que un «guardado» mentiroso apareciera si fuera a hacerlo.
      await page.waitForTimeout(800);
      await expect(page.getByText('Datos fiscales guardados')).toHaveCount(0);
      await expect(nif).toHaveValue(NIF);
      await expect(page.getByText('Cambios sin guardar en: Datos fiscales e IVA')).toBeVisible();
    });
  }

  test('doble toque en Guardar los datos fiscales: una sola petición', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#datos-fiscales', { retrasoMs: 1_000 });

    const nif = page.getByRole('textbox', { name: 'NIF / CIF' });
    await expect(nif).toBeVisible({ timeout: 30_000 });
    await nif.fill(NIF);
    await page.getByRole('button', { name: 'Guardar', exact: true }).dblclick();

    await expect(page.getByText('Datos fiscales guardados')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
  });
});

// ─── Cobros ──────────────────────────────────────────────────────────────────

function togglePermitirDevolver(page: Page) {
  return page.getByRole('switch', { name: 'Permitir devolver desde Tentare' });
}

// Devoluciones tiene su cajón (15-sep, v2), y SEPA el suyo: ya no conviven en
// pantalla, así que lo que se fija es que cada «Guardar» manda lo suyo y que,
// siendo dinero, pregunta antes.
const DEVOLUCIONES = ['reembolso_plazo_dias', 'reembolso_solo_sin_usar', 'reembolsos_activos'];

test.describe('Cobros: Devoluciones, en su cajón', () => {
  test('guardar las devoluciones pregunta antes y manda solo sus tres campos', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#devoluciones');

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('30');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    const pregunta = page.getByRole('dialog', { name: '¿Permitir devolver desde Tentare?' });
    await expect(pregunta).toContainText('hasta 30 días');
    expect(patches).toHaveLength(0);
    await pregunta.getByRole('button', { name: 'Sí, permitirlo' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0]).toMatchObject({ reembolsos_activos: true, reembolso_plazo_dias: 30 });
    expect(Object.keys(patches[0]).sort()).toEqual(DEVOLUCIONES);
    await expect(page.getByText('Política de devoluciones guardada')).toBeVisible();
  });

  test('doble toque al confirmar: una sola petición', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#devoluciones', { retrasoMs: 1_000 });

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, permitirlo' }).dblclick();

    await expect(page.getByText('Política de devoluciones guardada')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
  });

  test('si el servidor no lo guarda, no dice «guardada» y la política elegida se queda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#devoluciones', { respuesta: 'cero-filas' });

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('30');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByRole('button', { name: 'Sí, permitirlo' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await expect(page.getByText('Política de devoluciones guardada')).toHaveCount(0);
    await expect(page.getByText('No se ha guardado: tu usuario no puede cambiar los datos de este estudio.').first())
      .toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveValue('30');
  });

  test('un plazo fuera de rango no se manda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=cobros#devoluciones');

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('5000');

    await expect(page.getByText(/entre 0 y 365/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await page.waitForTimeout(300);
    expect(patches).toHaveLength(0);
  });
});

// ─── Legal ───────────────────────────────────────────────────────────────────

const AVISO_CONSENTIMIENTO = /no se les cobrará ninguna penalización hasta que acepten el texto nuevo/;

test.describe('Legal', () => {
  test('doble toque en Guardar términos: una sola petición', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal', { retrasoMs: 1_000 });

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    await page.getByRole('button', { name: 'Guardar', exact: true }).dblclick();

    await expect(page.getByText('Términos y condiciones guardados')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ terminos_servicio: 'Condiciones nuevas del estudio.' });
  });

  // Los dos textos van en un cajón con un solo «Guardar» (15-sep, v2): manda
  // SOLO el que ha cambiado, para no pisar con lo que tenía en memoria el otro.
  test('guardar manda solo el texto que ha cambiado', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal');

    const politica = page.locator('textarea').nth(0);
    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await politica.fill('Política nueva del estudio.');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0]).toEqual({ politica_privacidad: 'Política nueva del estudio.' });
    await expect(page.getByText('Política de privacidad guardada')).toBeVisible();
  });

  test('si el servidor no lo guarda, no dice «guardados» y el texto se queda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal', { respuesta: '403' });

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await expect(page.getByText('Términos y condiciones guardados')).toHaveCount(0);
    await expect(terminos).toHaveValue('Condiciones nuevas del estudio.');
  });

  test('con penalización activa, cambiar los términos avisa de que hay que volver a aceptarlos', async ({ page }) => {
    await montar(page, '/configuracion?tab=estudio&sub=legal', {
      fila: { ...STUDIO_ROW, penalizacion_importe_eur: 5 },
    });

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    // Sin tocar nada todavía, no hay nada de lo que avisar.
    await expect(page.getByText(AVISO_CONSENTIMIENTO)).toHaveCount(0);
    await terminos.fill('Condiciones nuevas del estudio.');
    await expect(page.getByText(AVISO_CONSENTIMIENTO)).toBeVisible();
  });

  test('sin penalización, cambiar los términos no avisa de nada', async ({ page }) => {
    await montar(page, '/configuracion?tab=estudio&sub=legal');

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    // Algo tiene que haber reaccionado al cambio antes de afirmar la ausencia.
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeEnabled();
    await page.waitForTimeout(300);
    await expect(page.getByText(AVISO_CONSENTIMIENTO)).toHaveCount(0);
  });
});
