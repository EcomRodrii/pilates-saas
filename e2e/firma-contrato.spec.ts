import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Esa firma no es de la clienta."
//
// El alta desde el panel EXIGÍA firmar para poder continuar: el botón estaba
// bloqueado hasta escribir un nombre en el campo "firma digital". Cuando la
// clienta se apunta por teléfono, la única salida era que la recepcionista
// tecleara el nombre de la clienta — y quedaba guardado en las mismas tres
// columnas que una firma de la propia socia, sin nada que las distinga.
//
// Para el RGPD (art. 7.1) el responsable tiene que poder demostrar QUIÉN
// consintió. Ahora: la firma es opcional, sin ella la socia se crea igual y el
// portal se la pide a ella (ese flujo ya existía), y si se recoge en mostrador
// queda marcada como tal.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  const inserts: Record<string, unknown>[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
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
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => {
    if (route.request().method() === 'GET') return json(route, []);
    const body = JSON.parse(route.request().postData() || '{}');
    inserts.push(Array.isArray(body) ? body[0] : body);
    return json(route, []);
  });

  await page.goto('/clientas');
  return inserts;
}

async function irAlContrato(page: Page) {
  await page.getByRole('button', { name: /Nueva clienta|Añadir primera clienta/ }).first().click({ timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Nombre' }).fill('María');
  await page.getByRole('textbox', { name: 'Apellidos' }).fill('Soler Puig');
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com');
  await page.getByRole('button', { name: /Siguiente — Contrato/ }).click();
  await page.getByRole('checkbox').check();
}

test.describe('La firma del contrato dice de quién es', () => {
  test('se puede dar de alta SIN firmar: la clienta queda pendiente', async ({ page }) => {
    const inserts = await montar(page);
    await irAlContrato(page);

    // El aviso explica qué va a pasar, en vez de bloquear el botón.
    await expect(page.getByRole('dialog')).toContainText('Queda pendiente de firma');
    await expect(page.getByRole('dialog')).toContainText('firmará ella');

    const boton = page.getByRole('button', { name: 'Crear clienta', exact: true });
    await expect(boton).toBeEnabled();
    await boton.click();

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    expect(inserts).toHaveLength(1);
    // Sin firma no se inventa ninguna aceptación.
    expect(inserts[0].aceptacion_fecha).toBeFalsy();
    expect(inserts[0].aceptacion_firma).toBeFalsy();
    expect(inserts[0].aceptacion_origen).toBeFalsy();
  });

  test('si se firma en el estudio, queda marcado como recogido en mostrador', async ({ page }) => {
    const inserts = await montar(page);
    await irAlContrato(page);
    await page.getByPlaceholder(/Nombre completo de la clienta/i).fill('María Soler Puig');

    // Se dice claramente que la recoge el estudio, no que la firma la clienta.
    await expect(page.getByRole('dialog')).toContainText('Firmado en el estudio');
    await expect(page.getByRole('dialog')).toContainText('recogido presencialmente por el estudio');

    await page.getByRole('button', { name: 'Crear clienta y firmar' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].aceptacion_firma).toBe('María Soler Puig');
    // Lo que distingue esta firma de una de la socia.
    expect(inserts[0].aceptacion_origen).toBe('MOSTRADOR');
    expect(inserts[0].aceptacion_por).toBeTruthy();
  });
});
