import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// /clientas/respuestas: lo que ha contestado cada alumna a las preguntas del
// estudio («Datos extra de la ficha»), todo junto. Antes solo se veía abriendo
// ficha a ficha.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const socio = (id: string, nombre: string, extra: Record<string, unknown>, activo = true) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos: 'Prueba', email: `${id}@example.com`, telefono: null,
  activo, fecha_alta: '2026-01-10T09:00:00+00:00', lead_stage: 'ACTIVA', campos_extra: extra, tags: [],
});
const campo = (id: string, etiqueta: string, tipo: string, orden: number, requerido: boolean, opciones: string[] = []) => ({
  id, studio_id: STUDIO_ID, etiqueta, tipo, opciones, requerido, orden, activo: true,
});

const CAMPOS = [
  campo('cp-obj', 'Objetivo', 'seleccion', 0, true, ['Fuerza', 'Flexibilidad']),
  campo('cp-como', 'Cómo nos conociste', 'texto', 1, false),
];
const SOCIOS = [
  socio('s-ana', 'Ana', { 'cp-obj': 'Fuerza', 'cp-como': 'Instagram' }),
  // Texto que Excel ejecutaría como fórmula si no se neutraliza.
  socio('s-bea', 'Bea', { 'cp-obj': 'Fuerza', 'cp-como': '=HYPERLINK("x")' }),
  socio('s-car', 'Carla', {}),
  // De baja: no cuenta.
  socio('s-dan', 'Dani', { 'cp-obj': 'Flexibilidad' }, false),
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: { campos?: unknown[]; activas?: boolean } = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  // Playwright resuelve en orden INVERSO al de registro: primero lo genérico.
  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/api/billing/status**', (r) => json(r, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: AUTH_UID,
    email: 'cloe@example.com', moneda: 'EUR', preguntas_alta_activas: opts.activas ?? true,
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/rpc/stats_clientas', (r) => json(r, [{ total: 3, activas: 3, con_bono: 0, inactivas_30d: 0 }]));
  await page.route('**/rest/v1/socios**', (r) => json(r, SOCIOS));
  await page.route('**/rest/v1/campos_personalizados**', (r) => json(r, opts.campos ?? CAMPOS));
}

test.describe('Clientas → Respuestas', () => {
  test('todas las respuestas juntas: resumen, tabla, filtro y enlace a la ficha', async ({ page }) => {
    await montar(page);
    await page.goto('/clientas/respuestas');
    await expect(page.getByRole('heading', { name: 'Respuestas de tus alumnas' })).toBeVisible({ timeout: 30_000 });

    // Solo las de alta (Dani está de baja): 3, y 2 con todo contestado.
    await expect(page.getByText('alumnas lo han contestado todo')).toContainText('2 de 3');
    // Resumen: las dos preguntas tienen 2 de 3 contestadas; en «Objetivo», las 2 dijeron Fuerza.
    const resumen = page.getByRole('region', { name: 'Resumen por pregunta' });
    await expect(resumen.getByText('2 de 3 la han contestado')).toHaveCount(2);
    await expect(resumen.getByText('2 · 100 %')).toBeVisible();
    await expect(resumen.getByText('0 · 0 %')).toBeVisible();

    const tabla = page.getByTestId('tabla-respuestas');
    await expect(tabla.getByRole('row')).toHaveCount(4); // cabecera + 3
    await expect(tabla.getByRole('row', { name: /Ana Prueba/ })).toContainText('Instagram');
    await expect(tabla.getByRole('row', { name: /Carla Prueba/ })).toContainText('Le faltan 2');
    await expect(tabla.getByText('Dani Prueba')).toHaveCount(0);

    await page.getByRole('button', { name: /Les falta algo/ }).click();
    await expect(tabla.getByRole('row')).toHaveCount(2);
    await expect(tabla.getByRole('link', { name: 'Carla Prueba' })).toHaveAttribute('href', '/clientas/s-car');
  });

  test('exporta un CSV que Excel no puede ejecutar', async ({ page }) => {
    await montar(page);
    await page.goto('/clientas/respuestas');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar/ }).click({ timeout: 30_000 });
    const d = await descarga;
    expect(d.suggestedFilename()).toMatch(/^respuestas-pilates-centro-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync(await d.path() as string, 'utf8').replace(/^﻿/, '');
    const lineas = csv.split('\r\n');
    expect(lineas[0]).toBe('Alumna;Objetivo;Cómo nos conociste;Estado');
    expect(lineas).toContain('Ana Prueba;Fuerza;Instagram;Completa');
    // La fórmula llega como texto (apóstrofo delante), nunca como fórmula.
    expect(lineas.find((l) => l.startsWith('Bea Prueba'))).toBe(`Bea Prueba;Fuerza;"'=HYPERLINK(""x"")";Completa`);
    expect(csv).not.toContain('@example.com');
  });

  test('sin preguntas: explica dónde se crean', async ({ page }) => {
    await montar(page, { campos: [] });
    await page.goto('/clientas/respuestas');
    await expect(page.getByText('Aún no haces ninguna pregunta')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Crear preguntas' })).toHaveAttribute('href', '/configuracion?tab=altas');
  });

  test('con el interruptor apagado, avisa de que la alumna no las ve en su app', async ({ page }) => {
    await montar(page, { activas: false });
    await page.goto('/clientas/respuestas');
    await expect(page.getByRole('note')).toContainText('todavía no las contestan en su app', { timeout: 30_000 });
  });

  test('Clientas lleva a Respuestas', async ({ page }) => {
    await montar(page);
    await page.goto('/clientas');
    await page.getByRole('button', { name: 'Respuestas' }).click({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/clientas\/respuestas$/);
    await expect(page.getByRole('heading', { name: 'Respuestas de tus alumnas' })).toBeVisible({ timeout: 30_000 });
  });
});
