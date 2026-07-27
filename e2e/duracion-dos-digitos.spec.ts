import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Se come el segundo dígito al escribir rápido.»
//
// El clamp vive en el onChange: `Math.max(15, Number(e.target.value))`. Al
// teclear "50", el "5" intermedio se reescribe a 15 y React repinta el value,
// así que el segundo dígito ya no se suma al primero.
//
// No es un caso raro: TODA duración real de pilates —30, 45, 50, 60, 90—
// empieza por un dígito menor que 15. El campo está roto para lo único que
// alguien va a escribir en él.
//
// Es el MISMO bug que ya se cazó y se documentó en el campo de «repetir N
// semanas» de este mismo formulario, con el mismo clamp `Math.max(2, ...)`.
// Aquí se aplica la misma solución: limitar solo por arriba y tratar el mínimo
// como estado inválido que bloquea el botón, en vez de corregir el número por
// debajo de quien escribe.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' }];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 8, color: '#F7A6C4' }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
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
}

async function mockBackend(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
}

async function abrirRecurrentes(page: Page) {
  await page.goto('/calendario?recurrentes=1');
  await expect(page.getByText('Crear clases recurrentes')).toBeVisible({ timeout: 30_000 });
}

// Teclear de verdad, dígito a dígito: `fill()` mete el valor de golpe y no
// reproduce nada — el bug está en el estado INTERMEDIO tras la primera tecla.
async function teclear(page: Page, campo: ReturnType<Page['getByRole']>, texto: string) {
  await campo.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  for (const c of texto) await page.keyboard.press(c);
}

test.describe('Duración de una clase recurrente', () => {
  for (const duracion of ['50', '45', '60', '90', '30']) {
    test(`se puede escribir ${duracion} minutos`, async ({ page }) => {
      await mockBackend(page);
      await seedSesionDeDuena(page);
      await abrirRecurrentes(page);

      const campo = page.getByRole('spinbutton', { name: /Duración/i });
      await teclear(page, campo, duracion);
      await expect(campo, `escribir "${duracion}" tiene que dejar ${duracion}`).toHaveValue(duracion);
    });
  }
});

test.describe('Por debajo del mínimo se avisa, no se corrige', () => {
  test('una duración de 5 minutos bloquea el botón en vez de convertirse en 15', async ({ page }) => {
    // La diferencia importa: corrigiendo, el campo enseña 15 y se crean 20
    // clases de 15 minutos que nadie pidió. Bloqueando, no se crea nada y se
    // dice por qué.
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirRecurrentes(page);

    const campo = page.getByRole('spinbutton', { name: /Duración/i });
    await teclear(page, campo, '5');

    await expect(campo, 'lo escrito se respeta').toHaveValue('5');
    await expect(page.getByText('Mínimo 15 minutos.')).toBeVisible();
    await expect(campo).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: /^Crear/ })).toBeDisabled();
  });

  test('el campo puede quedarse vacío mientras se escribe', async ({ page }) => {
    // Con un número siempre pintado, borrar daba `Number('') = 0`, React
    // repintaba un "0" y el siguiente dígito se le pegaba detrás ("050").
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirRecurrentes(page);

    const campo = page.getByRole('spinbutton', { name: /Duración/i });
    await campo.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');

    await expect(campo, 'vacío es vacío, no "0"').toHaveValue('');
    await expect(page.getByRole('button', { name: /^Crear/ })).toBeDisabled();
  });

  test('una duración válida desbloquea el botón', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirRecurrentes(page);

    const campo = page.getByRole('spinbutton', { name: /Duración/i });
    await teclear(page, campo, '50');
    await expect(page.getByText('Mínimo 15 minutos.')).toHaveCount(0);
  });
});
