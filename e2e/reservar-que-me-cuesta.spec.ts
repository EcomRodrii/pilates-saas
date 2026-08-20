import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, AHORA, fixtureSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// §3 — «La alumna nunca debería llegar al checkout sin saber exactamente qué
// está reservando».
//
// Cubre los dos defectos reales que había, a través de la UI de verdad (no
// leyendo el JSX):
//
//   1. El precio del listado se calculaba con la cobertura de OTRA clase:
//      `cubierta` se resolvía UNA vez con el tipo de la clase cuya hoja
//      estuviera abierta y se aplicaba a todos los slots. Con un bono SOLO de
//      Reformer, la clase de Mat —que hay que pagar— aparecía sin precio.
//   2. Con plan que cubre, el botón decía "Reservar" a secas: ni de qué bono
//      sale, ni cuántas sesiones quedan después.
//
// Son assertions de DISPLAY, no de escritura, así que aquí no aplica la regla
// del contador de intentos (no se pulsa "Reservar" en ningún momento): lo que
// se comprueba es lo que la alumna LEE antes de decidir.
// ─────────────────────────────────────────────────────────────────────────────

const SESION_REFORMER = 'ses-ref';
const SESION_MAT = 'ses-mat';

/** La socia tiene un bono de 5 sesiones que SOLO cubre Reformer. */
function fixtureBonoSoloReformer() {
  const base = fixtureSociaLista();
  return {
    ...base,
    tiposClase: [
      ...base.tiposClase,
      { id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#8FC98A', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    planesTarifa: [
      // `tiposClaseIds` acotado: es lo que hace que el bono NO valga para Mat.
      { id: 'p-bono', studioId: STUDIO_ID, nombre: 'Bono 10 Reformer', tipo: 'BONO', precio: 90, sesiones: 10, activo: true, tiposClaseIds: ['tc-r'] },
      // Clase suelta PUNTUAL: de aquí sale el precio que debe seguir viéndose en Mat.
      { id: 'p-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 15, sesiones: 1, activo: true },
    ],
    sesiones: [
      { id: SESION_REFORMER, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false },
      { id: SESION_MAT, studioId: STUDIO_ID, tipoClaseId: 'tc-m', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T12:00:00', fin: '2026-08-12T12:50:00', aforoMaximo: 10, cancelada: false },
    ],
    socia: {
      ...base.socia,
      suscripciones: [{
        id: 'sus-1', studioId: STUDIO_ID, socioId: SOCIO_ID, planId: 'p-bono',
        estado: 'ACTIVA', fechaInicio: '2026-08-01', fechaFin: null, sesionesRestantes: 5,
        stripeSubscriptionId: null,
      }],
    },
  };
}

async function sembrar(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e', email: 'socia-e2e@test.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureBonoSoloReformer()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }) }));
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
}

test('la clase cubierta dice de qué bono sale y cuánto queda después', async ({ page }) => {
  await sembrar(page);
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();

  // Lo que antes no existía: el botón decía "Reservar" y nada más.
  // Se afirma sobre la FRASE COMPLETA, no sobre el nombre del bono a secas: ese
  // aparece también en la lista de "Bonos y membresías" más abajo en la misma
  // página, y `getByText(/Bono 10 Reformer/)` casaría con las dos cosas.
  // 5 sesiones antes → 4 DESPUÉS de reservar; el saldo útil es el de después.
  await expect(page.getByText(/Descuenta 1 sesión de tu Bono 10 Reformer · te quedarán 4/))
    .toBeVisible({ timeout: 30_000 });
});

test('la clase que el bono NO cubre conserva su precio (el bug de la cobertura compartida)', async ({ page }) => {
  await sembrar(page);

  // Se abre PRIMERO el Reformer cubierto: es justo lo que envenenaba el cálculo
  // antiguo, porque fijaba `cubierta = true` para todo el listado.
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByText(/te quedarán 4/)).toBeVisible({ timeout: 30_000 });
  // `exact` porque la cabecera tiene un "Cerrar sesión" que también casaría.
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  // Y ahora la de Mat, que su bono no cubre.
  await page.getByRole('button', { name: /Mat a las 12:00/ }).click();
  // Se le dice POR QUÉ, no solo que no está incluida: con el mensaje genérico,
  // quien tiene 5 sesiones de Reformer no entiende por qué Mat le cuesta.
  await expect(page.getByText(/no cubre esta clase/i)).toBeVisible({ timeout: 30_000 });
  // Y el precio sigue ahí. Antes desaparecía por el Reformer abierto antes.
  await expect(page.getByRole('button', { name: /^Reservar · 15 €$/ })).toBeVisible();
});

test('sin sesión no se afirma nada sobre el saldo de nadie', async ({ page }) => {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  // Misma fixture pero SIN socia: nadie ha entrado.
  await page.route('**/api/public/studio-data', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...fixtureBonoSoloReformer(), socia: null }),
  }));
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });

  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  // El precio público sí; el saldo de un bono que no sabemos si tiene, no.
  await expect(page.getByText(/Clase suelta · 15 €/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/te quedarán/)).toHaveCount(0);
  await expect(page.getByText(/tu Bono/)).toHaveCount(0);
});
