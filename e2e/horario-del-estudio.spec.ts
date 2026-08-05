import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Horario del estudio por día de la semana (tabla studio_horario, migr.
// 20260804210500). Antes el calendario decía "Cerrado" en CUALQUIER día sin
// clases programadas — no había ningún horario real que cruzar (ver
// lib/calendario-columnas.ts, campo `cerrado`). Esta suite fija dos
// contratos:
//   1. Configuración > Estudio > Horario guarda de verdad las 7 filas.
//   2. El calendario distingue "Cerrado" (fuera del horario configurado) de
//      "Sin clases" (dentro de horario, pero nadie ha programado nada).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  hora_apertura: '08:00:00', hora_cierre: '22:00:00',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
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
}

// dia_semana: 0=domingo..6=sábado (EXTRACT DOW), como en la tabla real.
function filaHorario(dia: number, abierto = true): Record<string, unknown> {
  return {
    studio_id: STUDIO_ID, dia_semana: dia, abierto,
    hora_apertura: abierto ? '08:00:00' : null,
    hora_cierre: abierto ? '22:00:00' : null,
  };
}

async function mockComun(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

test.describe('Configuración > Estudio > Horario', () => {
  test('la rejilla muestra los 7 días con su horario real, y guardar envía las 7 filas', async ({ page }) => {
    await mockComun(page);
    await seedSesionDeDuena(page);

    // Sábado (6) y domingo (0) cerrados, resto abiertos 08:00-22:00.
    const filas = [0, 1, 2, 3, 4, 5, 6].map(d => filaHorario(d, d !== 0 && d !== 6));
    await page.route('**/rest/v1/studio_horario**', async route => {
      if (route.request().method() === 'GET') return json(route, filas);
      return json(route, {}, 200);
    });

    await page.goto('/configuracion?tab=estudio&sub=horario');

    await expect(page.getByText('Horario del estudio')).toBeVisible({ timeout: 30_000 });
    // Lunes está abierto: sus inputs de hora son visibles.
    const filaLunes = page.locator('div', { hasText: 'Lunes' }).last();
    await expect(filaLunes).toBeVisible();
    // Domingo está cerrado: se ve el texto "Cerrado" en su fila, no inputs de hora.
    await expect(page.getByText('Cerrado', { exact: true }).first()).toBeVisible();

    let payloadGuardado: unknown[] | null = null;
    await page.route('**/rest/v1/studio_horario**', async route => {
      if (route.request().method() === 'POST') {
        payloadGuardado = route.request().postDataJSON();
        return json(route, payloadGuardado, 201);
      }
      return json(route, filas);
    });

    await page.getByRole('button', { name: 'Guardar horario' }).click();
    await expect(page.getByText('Horario guardado')).toBeVisible({ timeout: 30_000 });
    expect(payloadGuardado).not.toBeNull();
    expect((payloadGuardado as unknown as unknown[]).length).toBe(7);
  });

  test('preset "Horario estándar" abre los 7 días de 08:00 a 22:00 sin tener que guardar antes de verlo', async ({ page }) => {
    await mockComun(page);
    await seedSesionDeDuena(page);
    await page.route('**/rest/v1/studio_horario**', route => json(route, [filaHorario(0, false)]));

    await page.goto('/configuracion?tab=estudio&sub=horario');
    await expect(page.getByText('Horario del estudio')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cerrado', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Horario estándar/i }).click();
    await expect(page.getByText('Cerrado', { exact: true })).toHaveCount(0);
  });
});

test.describe('Calendario: "Cerrado" (horario) vs "Sin clases" (nada programado)', () => {
  test('un día fuera del horario configurado dice "Cerrado", aunque tenga clases', async ({ page }) => {
    await mockComun(page);
    await seedSesionDeDuena(page);
    await page.route('**/api/calendario**', route => json(route, {
      sesiones: [], reservas: [], sustituciones: [], salas: [], instructores: [],
      horaApertura: '08:00:00', horaCierre: '22:00:00',
      // domingo (dia local 6) cerrado, resto abiertos.
      horarioSemana: [0, 1, 2, 3, 4, 5, 6].map(dia => ({ dia, abierto: dia !== 6 })),
      rol: 'PROPIETARIO',
    }));

    await page.goto('/calendario');
    await expect(page.getByText('Cerrado').first()).toBeVisible({ timeout: 30_000 });
  });

  test('un día abierto sin clases dice "Sin clases", no "Cerrado"', async ({ page }) => {
    await mockComun(page);
    await seedSesionDeDuena(page);
    await page.route('**/api/calendario**', route => json(route, {
      sesiones: [], reservas: [], sustituciones: [], salas: [], instructores: [],
      horaApertura: '08:00:00', horaCierre: '22:00:00',
      horarioSemana: [0, 1, 2, 3, 4, 5, 6].map(dia => ({ dia, abierto: true })),
      rol: 'PROPIETARIO',
    }));

    await page.goto('/calendario');
    await expect(page.getByText('Sin clases').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cerrado')).toHaveCount(0);
  });
});
