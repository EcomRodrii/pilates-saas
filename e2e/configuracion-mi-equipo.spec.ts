import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi equipo» en filas con su valor (16-sep, v2). Era una tarjeta con su barra
// de guardar. Lo que se fija aquí:
//   · cada fila dice cómo está —crear clases, la app de tus instructoras, el modo
//     de Sustituciones, el aviso a las alumnas, las tarifas y quién hay en el
//     equipo— y qué hace cada rol, en lectura; a 375 y a 1024, sin salirse de lado;
//   · crear clases se guarda al tocarlo con SOLO su columna y, si el servidor
//     dice que no, vuelve atrás y lo dice, contando que sí se intentó;
//   · si las tarifas no se pueden leer, la fila no dice «ninguna»;
//   · sin el plan, el modo que se aplica es asistido, y eso es lo que dice;
//   · «Copiar» solo dice «Copiado» si el portapapeles lo tiene (#994).
// El equipo sembrado (panel-sembrado.ts): una propietaria, una instructora con
// tarifa por hora y una persona de recepción.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  plan: 'ESTUDIO', subscription_status: 'active', nif: 'B12345674', iva_por_defecto: 21,
  instructoras_crean_clases: true, avisar_alumnas: true, modo_autonomia: 'asistido',
};

const TARIFA_MARTA = {
  instructorId: 'ins-marta', tarifaHora: 22, moneda: 'EUR', baseMensualEur: null, recargoSustitucionPct: null, horasSemanalesContrato: null,
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, opts: {
  fila?: Record<string, unknown>;
  fallo?: 500 | 'cero-filas';
  falloTarifas?: boolean;
} = {}) {
  const patches: Record<string, unknown>[] = [];
  const lecturasTarifas: string[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, { ...FILA, ...opts.fila });
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    // Lo que devuelve PostgREST con `select=id`; `[]` es «la RLS no casó».
    return json(r, opts.fallo === 'cero-filas' ? [] : [{ id: STUDIO_ID }]);
  });
  await page.route(u => u.pathname === '/api/equipo/tarifas', r => {
    lecturasTarifas.push(r.request().method());
    return opts.falloTarifas
      ? json(r, { error: 'No se han podido leer las tarifas' }, 500)
      : json(r, { items: [TARIFA_MARTA] });
  });
  await ir(page, ruta);
  return { patches, lecturasTarifas };
}

// El id va en el enlace de la fila, o en la fila si lleva su acción (la app).
const valor = (page: Page, id: string) => page.locator(`[id="${id}"] [data-resumen]`);
const crearClases = (page: Page) => page.getByRole('switch', { name: 'Las instructoras crean sus clases' });
const copiar = (page: Page) => page.getByRole('button', { name: 'Copiar el enlace de la app de tus instructoras' });
const barra = (page: Page) => page.getByRole('region', { name: 'Cambios sin guardar' });
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const VISTAS = [
  { nombre: 'móvil 375×812', ancho: 375, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  { nombre: 'escritorio 1024×768', ancho: 1024, use: { viewport: { width: 1024, height: 768 } } },
] as const;

for (const vista of VISTAS) {
  test.describe(`Mi equipo en ${vista.nombre}`, () => {
    test.use(vista.use);

    test('cada fila con su valor, qué hace cada rol, sin barra de guardar y sin salirse de lado', async ({ page }) => {
      const { lecturasTarifas } = await abrir(page, 'configuracion?tab=equipo');
      await expect(crearClases(page)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

      await expect(valor(page, 'app-de-tus-instructoras')).toHaveText(/\/portal\/pilates-centro\/equipo$/);
      await expect(copiar(page)).toBeVisible();

      await expect(valor(page, 'fila-sustituciones')).toHaveText('Asistido: tú apruebas con un toque');
      await expect(page.locator('#fila-sustituciones')).toHaveAttribute('href', '/sustituciones');
      await expect(valor(page, 'fila-a-avisar-alumnas')).toHaveText('Les avisa por email y en su app');
      await expect(page.locator('#fila-a-avisar-alumnas')).toHaveAttribute('href', '/configuracion?tab=reservas#ajuste-avisar-alumnas');

      expect(lecturasTarifas.length, 'se piden las tarifas').toBeGreaterThan(0);
      await expect(valor(page, 'fila-liquidaciones')).toHaveText('1 de 1 instructora con tarifa por hora');
      await expect(page.locator('#fila-liquidaciones')).toHaveAttribute('href', '/equipo/liquidaciones');
      await expect(valor(page, 'fila-equipo')).toHaveText('1 instructora · 1 en recepción');
      await expect(page.locator('#fila-equipo')).toHaveAttribute('href', '/equipo');

      const roles = page.locator('[data-fila-informativa]');
      await expect(roles).toHaveCount(4);
      await expect(roles.nth(0)).toContainText('Propietaria');
      await expect(roles.nth(1)).toContainText('Responsable de sede');
      await expect(roles.nth(1)).toContainText('en Configuración su horario, sus salas y sus clases');
      await expect(roles.nth(2)).toContainText('Recepción');
      await expect(roles.nth(3)).toContainText('No entra en el panel');

      // Nada que guardar con un botón: ni barra ni «Guardar» en reposo.
      await expect(barra(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0);
      expect(await desborde(page), 'Mi equipo se sale de lado').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`mi-equipo-${vista.ancho}.png`), fullPage: true });
    });
  });
}

test.describe('Crear clases se guarda al tocarlo', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('manda su columna y ninguna más, y el interruptor se queda en lo nuevo', async ({ page }) => {
    const { patches } = await abrir(page, 'configuracion?tab=equipo');
    await expect(crearClases(page)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

    await crearClases(page).click();
    await expect(page.getByText('Tus instructoras ya no crean clases')).toBeVisible({ timeout: 15_000 });
    expect(patches).toEqual([{ instructoras_crean_clases: false }]);
    await expect(crearClases(page)).toHaveAttribute('aria-checked', 'false');
    await expect(barra(page)).toHaveCount(0);
  });

  for (const fallo of [500, 'cero-filas'] as const) {
    test(`si el servidor dice que no (${fallo}), vuelve atrás y dice por qué`, async ({ page }) => {
      const { patches } = await abrir(page, 'configuracion?tab=equipo', { fallo });
      await expect(crearClases(page)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

      await crearClases(page).click();
      // «No mintió» también es verdad si nunca se intentó escribir: se cuenta.
      await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
      expect(patches.every(p => Object.keys(p).join() === 'instructoras_crean_clases'), 'solo su columna').toBe(true);
      await expect(page.locator('#ajuste-instructoras-crean-clases [role="alert"]')).toContainText('No se ha guardado', { timeout: 15_000 });
      await expect(crearClases(page)).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByText('Tus instructoras ya no crean clases')).toHaveCount(0);
    });
  }
});

test.describe('Lo que se lee de otras pantallas', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('si las tarifas no se pueden leer, la fila no dice «ninguna»: dice qué hay allí', async ({ page }) => {
    const { lecturasTarifas } = await abrir(page, 'configuracion?tab=equipo', { falloTarifas: true });
    await expect(valor(page, 'fila-equipo')).toHaveText('1 instructora · 1 en recepción', { timeout: 30_000 });
    await expect.poll(() => lecturasTarifas.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // La respuesta ya ha llegado y no ha cambiado nada.
    await page.waitForTimeout(500);
    await expect(valor(page, 'fila-liquidaciones')).toHaveAttribute('data-resumen', 'descripcion');
    await expect(valor(page, 'fila-liquidaciones')).toHaveText('Lo que cobra cada instructora y lo que le debes cada mes');
  });

  test('sin el plan, el modo autónomo funciona como asistido, y la fila lo dice', async ({ page }) => {
    await abrir(page, 'configuracion?tab=equipo', { fila: { plan: 'BASE', modo_autonomia: 'autonomo' } });
    await expect(valor(page, 'fila-sustituciones')).toHaveText('Asistido: tu plan no incluye «Autónomo»', { timeout: 30_000 });
  });

  test('«Copiar» solo dice «Copiado» si el portapapeles lo tiene', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await abrir(page, 'configuracion?tab=equipo');
    await expect(copiar(page)).toBeVisible({ timeout: 30_000 });
    await copiar(page).click();
    await expect(copiar(page)).toHaveText('Copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/portal\/pilates-centro\/equipo$/);
  });

  test('si el navegador no deja copiar (Safari sin permiso), no dice «Copiado»', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { intentosCopia: number };
      w.intentosCopia = 0;
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => { w.intentosCopia += 1; return Promise.reject(new DOMException('NotAllowedError')); } },
        configurable: true,
      });
    });
    await abrir(page, 'configuracion?tab=equipo');
    await expect(copiar(page)).toBeVisible({ timeout: 30_000 });
    await copiar(page).click();
    await expect(page.getByText('No se ha podido copiar. Selecciona el enlace y cópialo a mano.')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { intentosCopia: number }).intentosCopia), 'se intentó copiar').toBeGreaterThan(0);
    await expect(copiar(page)).toHaveText('Copiar');
  });
});
