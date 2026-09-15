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

// ─── General ─────────────────────────────────────────────────────────────────

test.describe('General: guardar una cosa no borra otra', () => {
  test('elegir el IVA no borra el NIF, y Guardar manda los dos', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=general');

    const nif = page.getByRole('textbox', { name: 'NIF / CIF' });
    await expect(nif).toBeVisible({ timeout: 30_000 });
    await nif.fill(NIF);
    await page.getByRole('combobox', { name: 'IVA general' }).selectOption('10');

    // Margen para que un guardado instantáneo, si lo hubiera, vuelva y repinte.
    await page.waitForTimeout(800);
    await expect(nif).toHaveValue(NIF);

    await page.getByRole('button', { name: 'Guardar datos del estudio' }).click();
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ nif: NIF, iva_por_defecto: 10 });
    await expect(page.getByText('Datos del estudio guardados')).toBeVisible();
    // Guardado de verdad: la barra se va.
    await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0);
  });

  test('pegar el logo no borra la razón social a medio escribir', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=general');

    const razon = page.getByRole('textbox', { name: 'Razón social' });
    await expect(razon).toBeVisible({ timeout: 30_000 });
    await razon.fill('Estudio de Ejemplo SL');

    await page.getByRole('button', { name: 'o pegar un enlace' }).first().click();
    await page.getByRole('textbox', { name: 'Enlace de logo' }).fill('https://example.com/logo.png');
    await page.getByRole('button', { name: 'Usar este enlace' }).click();

    // El logo se guarda solo, y tiene que haber salido de verdad.
    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(patches.at(-1)).toMatchObject({ logo_url: 'https://example.com/logo.png' });
    await expect(page.getByText('Logo actualizado')).toBeVisible();

    await expect(razon).toHaveValue('Estudio de Ejemplo SL');
    await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
  });

  for (const respuesta of ['cero-filas', '403', 'abort'] as const) {
    test(`si el servidor dice que no (${respuesta}), no dice «guardados» y no pierde nada`, async ({ page }) => {
      const { patches } = await montar(page, '/configuracion?tab=estudio&sub=general', { respuesta });

      const nif = page.getByRole('textbox', { name: 'NIF / CIF' });
      await expect(nif).toBeVisible({ timeout: 30_000 });
      await nif.fill(NIF);
      await page.getByRole('button', { name: 'Guardar datos del estudio' }).click();

      await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
      // Tiempo para que un «guardado» mentiroso apareciera si fuera a hacerlo.
      await page.waitForTimeout(800);
      await expect(page.getByText('Datos del estudio guardados')).toHaveCount(0);
      await expect(nif).toHaveValue(NIF);
      await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
    });
  }
});

// ─── Cobros ──────────────────────────────────────────────────────────────────

function togglePermitirDevolver(page: Page) {
  return page.getByText('Permitir devolver desde Tentare').locator('xpath=../..').getByRole('button');
}

test.describe('Cobros: Devoluciones no borra SEPA', () => {
  test('guardar la política de devoluciones no borra los datos SEPA a medio escribir', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=cobros');

    const acreedor = page.getByPlaceholder('ES00ZZZ00000000000');
    await expect(acreedor).toBeVisible({ timeout: 30_000 });
    await acreedor.fill('ES12ZZZ12345678');

    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('30');
    await page.getByRole('button', { name: 'Guardar política' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0]).toMatchObject({ reembolsos_activos: true, reembolso_plazo_dias: 30 });
    await expect(page.getByText('Política de devoluciones guardada')).toBeVisible();

    await expect(acreedor).toHaveValue('ES12ZZZ12345678');
  });

  test('doble toque en Guardar política: una sola petición', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=cobros', { retrasoMs: 1_000 });

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('button', { name: 'Guardar política' }).dblclick();

    await expect(page.getByText('Política de devoluciones guardada')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
  });

  test('si el servidor no lo guarda, no dice «guardada» y la política elegida se queda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=cobros', { respuesta: 'cero-filas' });

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('30');
    await page.getByRole('button', { name: 'Guardar política' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(800);
    await expect(page.getByText('Política de devoluciones guardada')).toHaveCount(0);
    await expect(page.getByText('No se ha guardado: tu usuario no puede cambiar los datos de este estudio.').first())
      .toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveValue('30');
  });

  test('un plazo fuera de rango no se manda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=cobros');

    await expect(togglePermitirDevolver(page)).toBeVisible({ timeout: 30_000 });
    await togglePermitirDevolver(page).click();
    await page.getByRole('spinbutton').fill('5000');

    await expect(page.getByText(/entre 0 y 365/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar política' })).toBeDisabled();
    await page.waitForTimeout(300);
    expect(patches).toHaveLength(0);
  });
});

// ─── Legal ───────────────────────────────────────────────────────────────────

const AVISO_CONSENTIMIENTO = /tendrán que aceptarlos de nuevo/;

test.describe('Legal', () => {
  test('doble toque en Guardar términos: una sola petición', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal', { retrasoMs: 1_000 });

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    await page.getByRole('button', { name: 'Guardar términos' }).dblclick();

    await expect(page.getByText('Términos y condiciones guardados')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ terminos_servicio: 'Condiciones nuevas del estudio.' });
  });

  test('guardar la política de privacidad no borra los términos a medio escribir', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal');

    const politica = page.locator('textarea').nth(0);
    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    await politica.fill('Política nueva del estudio.');
    await page.getByRole('button', { name: 'Guardar política' }).click();

    await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
    expect(patches[0]).toEqual({ politica_privacidad: 'Política nueva del estudio.' });
    await expect(terminos).toHaveValue('Condiciones nuevas del estudio.');
  });

  test('si el servidor no lo guarda, no dice «guardados» y el texto se queda', async ({ page }) => {
    const { patches } = await montar(page, '/configuracion?tab=estudio&sub=legal', { respuesta: '403' });

    const terminos = page.locator('textarea').nth(1);
    await expect(terminos).toBeVisible({ timeout: 30_000 });
    await terminos.fill('Condiciones nuevas del estudio.');
    await page.getByRole('button', { name: 'Guardar términos' }).click();

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
    await expect(page.getByRole('button', { name: 'Guardar términos' })).toBeEnabled();
    await page.waitForTimeout(300);
    await expect(page.getByText(AVISO_CONSENTIMIENTO)).toHaveCount(0);
  });
});
