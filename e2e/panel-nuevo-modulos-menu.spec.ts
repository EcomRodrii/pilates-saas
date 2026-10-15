import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Con el panel nuevo, Módulos SUSTITUYE (15-oct-2026, punto 4 del rediseño):
//   · al conmutador «Esencial / Todo» del menú lateral: lo que sale en el menú
//     es lo que está activo en Módulos, y Módulos es una entrada del menú;
//   · a la fila «Tus módulos» de Configuración: queda un enlace a Módulos, y
//     «Tu menú» solo ordena (sin el ojo de ocultar, y sin mandar `ocultos`);
//   · a /explorar-funciones, que ya pinta Módulos.
// De serie, el menú es el de siempre en «Esencial»: lo de fuera del día a día
// nace oculto y se activa en Módulos (`activados`, lib/modulos/menu.ts).
// Sin el panel nuevo, todo igual que hoy. Cada fallo, con su contador.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const LAYOUT = { orden: [] as string[], ocultos: [] as string[], activados: [] as string[], menuPosition: 'lateral', home: { orden: [], ocultos: [] } };

async function abrir(page: Page, ruta: string, o: {
  nuevo?: boolean; ocultos?: string[]; activados?: string[]; tuTentare?: boolean;
  put?: (r: Route) => Promise<void> | void;
} = {}) {
  await montar(page);
  let { ocultos, activados } = { ocultos: o.ocultos ?? [], activados: o.activados ?? [] };
  const cuenta = { puts: [] as Record<string, unknown>[] };
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo ?? true,
  }));
  if (o.tuTentare) await page.route('**/api/configuracion/tu-tentare', (r) => json(r, { activo: true }));
  await page.route('**/api/layout**', async (r) => {
    if (r.request().method() === 'PUT') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      cuenta.puts.push(cuerpo);
      if (o.put) return o.put(r);
      ocultos = (cuerpo.ocultos as string[]) ?? ocultos;
      activados = (cuerpo.activados as string[]) ?? activados;
      return json(r, { ...LAYOUT, ...cuerpo, ocultos, activados });
    }
    return json(r, { ...LAYOUT, ocultos, activados });
  });
  await ir(page, ruta);
  return cuenta;
}

const menu = (page: Page) => page.locator('aside');
const enElMenu = (page: Page, nombre: string) => menu(page).getByRole('link', { name: nombre, exact: true });
const tarjeta = (page: Page, href: string) => page.locator(`[data-testid="modulo-nuevo"][data-modulo="${href}"]`);

test('con el panel nuevo: sin «Esencial / Todo», Módulos en el menú, y de serie el menú de siempre', async ({ page }) => {
  await abrir(page, 'clientas');
  await expect(enElMenu(page, 'Clientas')).toBeVisible({ timeout: 60_000 });
  await expect(menu(page).getByRole('button', { name: 'Esencial', exact: true })).toHaveCount(0);
  await expect(menu(page).getByRole('button', { name: 'Todo', exact: true })).toHaveCount(0);
  await expect(enElMenu(page, 'Módulos')).toHaveAttribute('href', '/explorar-funciones');
  // Lo de fuera del día a día no sale hasta que se activa en Módulos.
  await expect(enElMenu(page, 'Caja')).toHaveCount(0);
  await expect(enElMenu(page, 'Cierre de año')).toHaveCount(0);
  for (const nombre of ['Calendario', 'Citas', 'Cobros', 'Paquetes', 'Configuración']) await expect(enElMenu(page, nombre)).toBeVisible();
});

test('lo activado en Módulos sale en el menú, también al recargar', async ({ page }) => {
  await abrir(page, 'clientas', { activados: ['/pos'] });
  await expect(enElMenu(page, 'Caja')).toBeVisible({ timeout: 60_000 });
  await expect(enElMenu(page, 'Cierre de año')).toHaveCount(0);
});

test('activar Caja en Módulos guarda `activados` y la pone en el menú sin recargar; ocultarla la quita', async ({ page }) => {
  const cuenta = await abrir(page, 'explorar-funciones');
  const caja = tarjeta(page, '/pos');
  await expect(caja.getByTestId('chapa-modulo')).toHaveText('Oculto', { timeout: 60_000 });
  await expect(enElMenu(page, 'Caja')).toHaveCount(0);
  await caja.getByRole('switch', { name: 'Caja en el menú' }).click();
  await expect(caja.getByTestId('chapa-modulo')).toHaveText('Activo');
  expect(cuenta.puts).toEqual([{ ocultos: [], activados: ['/pos'] }]);
  await expect(enElMenu(page, 'Caja')).toBeVisible();

  await caja.getByRole('switch', { name: 'Caja en el menú' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ocultar Caja' }).click();
  await expect(caja.getByTestId('chapa-modulo')).toHaveText('Oculto');
  expect(cuenta.puts[1]).toEqual({ ocultos: ['/pos'], activados: [] });
  await expect(enElMenu(page, 'Caja')).toHaveCount(0);
});

test('si activar falla (500 o sin red), Caja sigue oculta, no sale en el menú y la tarjeta lo dice', async ({ page }) => {
  for (const falla of [(r: Route) => json(r, { error: 'boom' }, 500), (r: Route) => r.abort()]) {
    const cuenta = await abrir(page, 'explorar-funciones', { put: falla });
    const caja = tarjeta(page, '/pos');
    await caja.getByRole('switch', { name: 'Caja en el menú' }).click({ timeout: 60_000 });
    await expect(caja.getByRole('alert')).toBeVisible();
    expect(cuenta.puts.length, 'intentos de escribir').toBeGreaterThan(0);
    await expect(caja.getByRole('switch', { name: 'Caja en el menú' })).toHaveAttribute('aria-checked', 'false');
    await expect(enElMenu(page, 'Caja')).toHaveCount(0);
  }
});

test('Configuración › Tu panel: «Tus módulos» da paso al enlace a Módulos, y «Tu menú» solo ordena (sin mandar `ocultos`)', async ({ page }) => {
  const cuenta = await abrir(page, 'configuracion?tab=panel', { tuTentare: true, activados: ['/pos'] });
  const fila = page.getByTestId('fila-modulos');
  await expect(fila).toHaveAttribute('href', '/explorar-funciones', { timeout: 60_000 });
  await expect(fila).toContainText(/\d+ de \d+ activos/);
  // Aunque «Tu Tentare» esté encendido para el estudio, su lista no sale: la sustituye Módulos.
  await expect(page.getByTestId('tu-tentare')).toHaveCount(0);

  await page.locator('#menu-del-panel').click();
  const cajon = page.getByRole('dialog');
  await expect(cajon.getByRole('link', { name: 'Módulos' })).toHaveAttribute('href', '/explorar-funciones');
  await expect(cajon.getByRole('button', { name: /^Ocultar / })).toHaveCount(0);
  await expect(cajon.getByRole('button', { name: /^Mostrar / })).toHaveCount(0);
  // Solo lo que sale en el menú: Caja (activada) sí, Cierre de año (sin activar) no.
  await expect(cajon.getByText('Caja', { exact: true })).toBeVisible();
  await expect(cajon.getByText('Cierre de año', { exact: true })).toHaveCount(0);
  // Ordenar con el teclado y guardar: el PUT no lleva `ocultos` (los decide Módulos).
  const asa = cajon.getByRole('button', { name: 'Reordenar Informes' });
  await asa.focus();
  // dnd-kit coge, mueve y suelta en fotogramas distintos: sin respiro, el «soltar» llega antes de moverse.
  for (const tecla of ['Space', 'ArrowUp', 'Space']) {
    await page.keyboard.press(tecla);
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => cuenta.puts.length).toBeGreaterThan(0);
  expect(cuenta.puts[0]).not.toHaveProperty('ocultos');
  expect(cuenta.puts[0]).toHaveProperty('orden');
});

test('sin el panel nuevo, todo como hoy: «Esencial / Todo» en el menú, sin Módulos, y «Tus módulos» con su lista', async ({ page }) => {
  await abrir(page, 'configuracion?tab=panel', { nuevo: false, tuTentare: true });
  await expect(menu(page).getByRole('button', { name: 'Esencial', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(enElMenu(page, 'Módulos')).toHaveCount(0);
  await expect(page.getByTestId('tu-tentare')).toBeVisible();
  await expect(page.getByTestId('fila-modulos')).toHaveCount(0);
  // Y «Todo» enseña lo de siempre.
  await menu(page).getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(enElMenu(page, 'Caja')).toBeVisible();
});
