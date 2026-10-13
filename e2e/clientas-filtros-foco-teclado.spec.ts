import { resolveTheme } from '../lib/theme-schema.ts';
import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Clientas: con el teclado se ve en qué filtro estás.
//
// Los filtros de la barra (Plan, Etiqueta, Más filtros y, en el móvil, Orden)
// son `SelectFiltro`: una etiqueta pintada con el <select> nativo encima,
// invisible (`opacity-0`). El foco lo recibe ese select, así que su anillo no
// se veía: recorrer la barra con Tab era ir a ciegas. Ahora el anillo lo pinta
// la etiqueta, el mismo que el buscador de la página.
//
// Solo con el foco de TECLADO: en reposo la etiqueta no cambia, y pinchar con
// el ratón no lo enciende. Ojo: `:focus-visible` a secas no basta para eso —
// Chromium y WebKit se lo dan también a un select pinchado con el ratón (medido
// aquí mismo), por eso `SelectFiltro` apunta el pinchazo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const PLANES = [
  { id: 'pl-mensual', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true, es_prueba: false },
];
const SOCIOS = [{
  id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 's1@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-01T09:00:00+00:00', campos_extra: {}, tags: [], lead_stage: 'ACTIVA',
}];

async function montar(page: Page, oscuro: boolean) {
  await page.addInitScript(([key, uid, dark]) => {
    if (dark) localStorage.setItem('panel-dark-mode', '1');
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID, oscuro] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  // El tema con valores reales: con `{}`, `--ring` no sería el de producción.
  await page.route('**/api/theme**', route => json(route, resolveTheme({})));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));

  await page.goto('/clientas');
}

/** Lo que pinta la etiqueta, y el color de `--ring` resuelto en su mismo sitio (claro u oscuro). */
async function anillo(select: Locator) {
  return select.evaluate((el) => {
    const etiqueta = el.closest('label')!;
    const cs = getComputedStyle(etiqueta);
    const sonda = document.createElement('span');
    sonda.style.color = 'var(--ring)';
    etiqueta.parentElement!.appendChild(sonda);
    const ring = getComputedStyle(sonda).color;
    sonda.remove();
    return { sombra: cs.boxShadow, borde: cs.borderTopColor, ring, oscuro: Boolean(etiqueta.closest('.dark')) };
  });
}

for (const oscuro of [false, true]) {
  test.describe(`Clientas: el foco de teclado en los filtros se ve (${oscuro ? 'oscuro' : 'claro'})`, () => {
    test('con Tab, el filtro enfocado lleva el anillo; el que deja, no', async ({ page }) => {
      await montar(page, oscuro);
      const buscador = page.getByRole('searchbox', { name: 'Buscar clientas' });
      const plan = page.getByRole('combobox', { name: 'Plan', exact: true });
      const mas = page.getByRole('combobox', { name: 'Más filtros', exact: true });
      await expect(plan).toBeAttached({ timeout: 30_000 });

      // En reposo, nada: el arreglo no toca cómo se ve la barra.
      const reposo = await anillo(plan);
      expect(reposo.oscuro).toBe(oscuro);
      expect(reposo.sombra).toBe('none');
      expect(reposo.borde).not.toBe(reposo.ring);

      await buscador.focus();
      await page.keyboard.press('Tab');
      await expect(plan).toBeFocused();
      const enPlan = await anillo(plan);
      // `ring-3`: una sombra de 3 px alrededor, y el borde en el color del foco
      // (con `transition-colors` el borde tarda un poco en llegar: se espera).
      expect(enPlan.sombra).toMatch(/0px 0px 0px 3px/);
      await expect.poll(async () => { const a = await anillo(plan); return a.borde === a.ring; }).toBe(true);

      // Sin etiquetas sembradas no hay filtro «Etiqueta»: el siguiente es «Más filtros».
      await page.keyboard.press('Tab');
      await expect(mas).toBeFocused();
      expect((await anillo(mas)).sombra).toMatch(/0px 0px 0px 3px/);
      expect((await anillo(plan)).sombra).toBe('none');
    });

    test('pinchar con el ratón no enciende el anillo; volver con el teclado, sí', async ({ page }) => {
      await montar(page, oscuro);
      const buscador = page.getByRole('searchbox', { name: 'Buscar clientas' });
      const plan = page.getByRole('combobox', { name: 'Plan', exact: true });
      await expect(plan).toBeAttached({ timeout: 30_000 });

      await plan.click();
      await expect(plan).toBeFocused();
      // Lo que mide el navegador (true) es justo lo que no hay que pintar.
      expect(await plan.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
      const tras = await anillo(plan);
      expect(tras.sombra).toBe('none');
      expect(tras.borde).not.toBe(tras.ring);

      // El pinchazo no se queda apuntado: volviendo con el teclado, el anillo sale.
      // ⚠️ No con un Tab desde el select pinchado: el clic abre la lista nativa y
      // en Linux (CI) esa lista se come el Tab, el foco no se mueve. Llevar el foco
      // al buscador cierra la lista y hace saltar el blur, que es lo que se prueba.
      await buscador.focus();
      await page.keyboard.press('Tab');
      await expect(plan).toBeFocused();
      expect((await anillo(plan)).sombra).toMatch(/0px 0px 0px 3px/);
    });
  });
}
