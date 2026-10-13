import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Motivación › Niveles con ritmo (P3.8), apagado tras
// `GAMIFICACION_NIVELES_RITMO`. Se edita la escala entera y se guarda de una
// vez; la equivalencia en clases sale de las reglas del estudio; y NADIE BAJA:
// un cambio que bajaría a alguna alumna ni se manda (y si el servidor lo
// rechaza, se dice). Con contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', creditos_nombre: null, creditos_caducan_meses: null, racha_clases_semana: null,
  requiere_checkin_qr: true,
};
const regla = (id: string, trigger: string, creditos: number) => ({
  id, studio_id: STUDIO_ID, trigger, nombre: trigger, descripcion: null, creditos, activa: true, tope_mensual: null, unidad_euros: null, creado_en: '2026-01-01T00:00:00Z',
});
// 10 por venir + 30 por semana entre 2 clases = 25 por clase.
const REGLAS = [regla('rwr-1', 'ASISTENCIA_CLASE', 10), regla('rwr-2', 'SEMANA_COMPLETA', 30)];
const nivel = (id: string, nombre: string, umbral: number) => ({
  id, studio_id: STUDIO_ID, nombre, orden: 0, umbral_creditos: umbral, color: '#8B7355', icono: '·', beneficios: null, activo: true, creado_en: '2026-01-01T00:00:00Z',
});
const NIVELES = [nivel('lvl-a', 'Respiración', 0), nivel('lvl-b', 'Centro', 200), nivel('lvl-c', 'Control', 500)];
// Una alumna con 300 está en «Centro»; otra con 700, en «Control».
const TOTALES = [0, 50, 300, 700];

/** Lo que devolvería el servidor al guardar: lo mismo, con ids para los nuevos. */
const eco = (cuerpo: { niveles: { id?: string; nombre: string; umbralCreditos: number; activo: boolean }[] }) => ({
  niveles: cuerpo.niveles.map((n, i) => ({
    id: n.id ?? `lvl-nuevo-${i}`, studioId: STUDIO_ID, nombre: n.nombre, orden: i, umbralCreditos: n.umbralCreditos,
    color: '#8B7355', icono: '·', beneficios: null, activo: n.activo, creadoEn: '2026-10-13T00:00:00Z',
  })),
});

async function abrir(page: Page, o: {
  encendido: boolean;
  put?: { status: number; body: unknown } | 'eco' | 'sin-red';
  get?: { status: number; body: unknown };
  reglas?: unknown[];
}) {
  await montar(page);
  const lecturas: number[] = [];
  const guardados: unknown[] = [];
  // ⚠️ Después de `montar()`: gana la ruta registrada más tarde.
  await page.route('**/rest/v1/studios**', (r) => json(r, FILA));
  await page.route('**/rest/v1/reward_rules**', (r) => json(r, o.reglas ?? REGLAS));
  await page.route('**/rest/v1/level_definitions**', (r) => json(r, NIVELES));
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { nivelesConRitmo: o.encendido }));
  await page.route((u) => u.pathname === '/api/estudio/niveles', (r) => {
    if (r.request().method() === 'GET') {
      lecturas.push(1);
      if (o.get) return json(r, o.get.body, o.get.status);
      return json(r, { totales: TOTALES, sinLista: { clases: 20, sinNadie: 0 } });
    }
    const cuerpo = r.request().postDataJSON();
    guardados.push(cuerpo);
    if (o.put === 'sin-red') return r.abort();
    if (!o.put || o.put === 'eco') return json(r, eco(cuerpo));
    return json(r, o.put.body, o.put.status);
  });
  await ir(page, 'configuracion?tab=motivacion#niveles');
  return { lecturas, guardados };
}

test('apagado: el editor de siempre, y no se piden totales', async ({ page }) => {
  const { lecturas } = await abrir(page, { encendido: false });
  await expect(page.getByRole('button', { name: /Nuevo nivel/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('editor-niveles')).toHaveCount(0);
  expect(lecturas).toHaveLength(0);
});

test('encendido: equivalencia en clases, reparto, y un cambio que bajaría a alguien ni se manda', async ({ page }) => {
  const { lecturas, guardados } = await abrir(page, { encendido: true });
  const editor = page.getByTestId('editor-niveles');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await expect(editor).toContainText('una clase da unos 25 créditos');
  await expect.poll(() => lecturas.length).toBeGreaterThan(0);
  await expect(page.getByTestId('vista-previa-niveles')).toContainText('Respiración: 2 · Centro: 1 · Control: 1');
  // «Centro» desde 8 clases = 200; subirlo a 16 clases (400) bajaría a la alumna con 300.
  await expect(page.getByLabel('Clases para Centro')).toHaveValue('8');
  await page.getByLabel('Clases para Centro').fill('16');
  await expect(page.getByRole('alert').filter({ hasText: 'bajarían de nivel: 1 alumna de «Centro»' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar niveles' })).toBeDisabled();
  expect(guardados).toHaveLength(0);
});

test('encendido: aplicar un ritmo y guardar manda la escala entera (con nombres distintos) y queda guardada', async ({ page }) => {
  const { guardados } = await abrir(page, { encendido: true, put: 'eco' });
  await expect(page.getByTestId('editor-niveles')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('vista-previa-niveles')).toContainText('Respiración: 2');
  // Relajado: 0/10/25/50/100 clases × 25 = 0/250/630/1250/2500 → con 300 «Centro»(250) y con 700 «Control»(630): nadie baja.
  await page.getByRole('radio', { name: /Relajado/ }).click();
  await expect(page.getByRole('radio', { name: /Relajado/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Guardar niveles' }).click();
  await expect.poll(() => guardados.length, { timeout: 20_000 }).toBe(1);
  const cuerpo = guardados[0] as { niveles: { id?: string; nombre: string; umbralCreditos: number }[] };
  expect(cuerpo.niveles.map((n) => n.umbralCreditos)).toEqual([0, 250, 630, 1250, 2500]);
  expect(cuerpo.niveles.slice(0, 3).map((n) => n.id)).toEqual(['lvl-a', 'lvl-b', 'lvl-c']);
  const nombres = cuerpo.niveles.map((n) => n.nombre);
  expect(new Set(nombres).size, `nombres repetidos: ${nombres.join(', ')}`).toBe(nombres.length);
  // Guardado: sin cambios pendientes.
  await expect(page.getByText('Niveles guardados')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar niveles' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deshacer cambios' })).toHaveCount(0);
});

test('con 30 por clase, reescribir las clases que ya se ven no mueve el umbral (ni baja a nadie)', async ({ page }) => {
  await abrir(page, { encendido: true, reglas: [regla('rwr-1', 'ASISTENCIA_CLASE', 30)] });
  await expect(page.getByTestId('vista-previa-niveles')).toContainText('Respiración: 2', { timeout: 60_000 });
  // 200 / 30 se enseña como «7»: volver a escribir «7» deja el umbral en 200.
  await expect(page.getByLabel('Clases para Centro')).toHaveValue('7');
  await page.getByLabel('Clases para Centro').fill('7');
  await expect(page.getByLabel('créditos para Centro')).toHaveValue('200');
  await expect(page.getByRole('alert').filter({ hasText: 'bajarían' })).toHaveCount(0);
});

test('si no se pueden leer los créditos, se dice y no se deja guardar (y sí se intentó)', async ({ page }) => {
  const { lecturas, guardados } = await abrir(page, { encendido: true, get: { status: 503, body: { error: 'x' } } });
  await expect(page.getByTestId('editor-niveles')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => lecturas.length).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se han podido leer los créditos' })).toBeVisible();
  await page.getByLabel('Nombre del nivel 1').fill('Base');
  await expect(page.getByRole('button', { name: 'Guardar niveles' })).toBeDisabled();
  expect(guardados).toHaveLength(0);
});

test('si se corta la red al guardar, no se dice ni «guardado» ni «no se ha guardado»: no se sabe', async ({ page }) => {
  const { guardados } = await abrir(page, { encendido: true, put: 'sin-red' });
  await expect(page.getByTestId('vista-previa-niveles')).toContainText('Respiración: 2', { timeout: 60_000 });
  await page.getByLabel('Nombre del nivel 1').fill('Base');
  await page.getByRole('button', { name: 'Guardar niveles' }).click();
  await expect.poll(() => guardados.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'no sabemos si se ha guardado' })).toBeVisible();
  await expect(page.getByText('Niveles guardados')).toHaveCount(0);
});

test('si el servidor no guarda (409: alguien bajaría), se dice en rojo y sí se intentó', async ({ page }) => {
  const { guardados } = await abrir(page, {
    encendido: true,
    put: { status: 409, body: { error: 'Con este cambio 1 alumna bajaría de nivel, y lo que ya tienen no se toca. No se ha guardado nada.' } },
  });
  await expect(page.getByTestId('editor-niveles')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('vista-previa-niveles')).toContainText('Respiración: 2');
  await page.getByLabel('Nombre del nivel 1').fill('Base');
  await page.getByRole('button', { name: 'Guardar niveles' }).click();
  await expect.poll(() => guardados.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha guardado nada' })).toBeVisible();
  await expect(page.getByText('Niveles guardados')).toHaveCount(0);
});
