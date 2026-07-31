import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-5. "Los 7 especialistas dicen 'Excelente · Todo en orden' en un estudio con
// 0 ingresos […]. Y arriba, en la misma pantalla, dice 'aún estoy conociendo tu
// estudio, necesito semanas de datos'."
//
// Las dos cosas no pueden ser verdad a la vez. Pasaba porque el bloque "Mi
// Equipo" estaba FUERA del ternario del modo aprendizaje, y su guarda es
// siempre cierta: la API siembra los 7 especialistas aunque no haya análisis.
//
// Y el verde afirmaba de más: el director emite EXCELENTE cuando hay CERO
// recomendaciones pendientes, que no es lo mismo que "el negocio va bien".
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const LOS_SIETE = ['RETENCION', 'INGRESOS', 'AGENDA', 'CAPTACION', 'MARKETING', 'FINANZAS', 'EQUIPO']
  .map(especialista => ({ especialista, pendientes: 0, impactoTotal: null, estado: 'EXCELENTE' as const }));

// Forma real de ResumenAPI (components/decision/use-decisiones.ts:37).
const RESUMEN = {
  estadoGeneral: 'EXCELENTE' as const,
  saludo: 'Buenos días',
  mientrasDormias: [],
  nDecisiones: 0,
  tiempoEstimadoMin: 0,
  impactoTotal: null,
  generadoEn: '2026-08-05T06:30:00+00:00',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `conResumen: false` = el análisis no ha corrido → modo aprendizaje. */
async function montarCentro(page: Page, conResumen: boolean) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
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
  // Los 7 especialistas llegan SIEMPRE, con o sin análisis: así los siembra la API.
  // veredicto/seguimiento: campos del Umbral (Fase 1) — sin relación con lo
  // que este test comprueba, así que van con el valor más neutro posible.
  await page.route('**/api/decisiones**', route => json(route, {
    resumen: conResumen ? RESUMEN : null,
    veredicto: { tipo: 'SIN_ANALIZAR', recomendacion: null, fraseConfianza: null, semanaTranquila: false },
    seguimiento: [],
    prioridades: [],
    masSituaciones: [],
    porEspecialista: LOS_SIETE,
    actividad: [],
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/centro-de-control');
}

test.describe('Centro de Control · los especialistas', () => {
  test('sin análisis: NO se pintan los 7 verdes junto a "aún estoy conociendo tu estudio"', async ({ page }) => {
    await montarCentro(page, false);

    // El Umbral (Fase 1) oculta todo el detalle —incluido "Mi Equipo" y el
    // aviso de modo aprendizaje— detrás de "Ver todo el detalle", colapsado
    // por defecto. La afirmación de este test (no pueden ser verdad a la vez)
    // sigue viva ahí dentro, solo que ya no es lo primero que se ve.
    await page.getByRole('button', { name: 'Ver todo el detalle' }).click();

    // El modo aprendizaje se anuncia…
    await expect(page.getByText('Aún estoy conociendo tu estudio')).toBeVisible({ timeout: 30_000 });

    // …y entonces NO puede haber ni un especialista diciendo que todo va bien.
    await expect(page.getByText('Especialista en Retención')).toHaveCount(0);
    await expect(page.getByText('Especialista en Ingresos')).toHaveCount(0);
    await expect(page.getByText('Nada que proponerte hoy.')).toHaveCount(0);
    await expect(page.getByText('Todo en orden.')).toHaveCount(0);
  });

  test('con análisis: se pintan, y dicen lo que el sistema sabe de verdad', async ({ page }) => {
    await montarCentro(page, true);
    await page.getByRole('button', { name: 'Ver todo el detalle' }).click();

    await expect(page.getByText('Especialista en Retención')).toBeVisible({ timeout: 30_000 });
    // Ya no está el modo aprendizaje contradiciéndolos.
    await expect(page.getByText('Aún estoy conociendo tu estudio')).toHaveCount(0);

    // Cero pendientes = "no tengo nada que proponerte", no "tu negocio va bien".
    // Se cuenta en toda la página en vez de adivinar la caja de cada tarjeta:
    // son 7 especialistas, así que la frase y la etiqueta salen 7 veces.
    await expect(page.getByText('Nada que proponerte hoy.')).toHaveCount(7);
    await expect(page.getByText('Al día', { exact: true })).toHaveCount(7);
    // Y la frase que afirmaba de más no queda en ninguna parte.
    await expect(page.getByText('Todo en orden.')).toHaveCount(0);
  });
});
