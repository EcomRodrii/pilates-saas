import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu Tentare» (P2.5): el catálogo de módulos en Configuración › Tu panel.
//
// Entra APAGADO: sin el interruptor (o con cualquier respuesta rara) la sección
// es exactamente la de antes. Encendido, el interruptor de cada módulo escribe
// `ocultos` —el mismo dato que el cajón «Tu menú»—, el PUT lleva SOLO eso, y el
// menú cambia sin recargar. Cada camino de fallo lleva contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const LAYOUT = { orden: [], ocultos: [] as string[], menuPosition: 'lateral', home: { orden: [], ocultos: [] } };

async function abrir(page: Page, o: {
  activo?: unknown; status?: number; plan?: string; put?: (r: Route, cuerpo: Record<string, unknown>) => Promise<void> | void;
  ocultos?: string[]; modo?: 'esencial' | 'avanzado'; lecturaFalla?: boolean;
} = {}) {
  if (o.modo === 'avanzado') await page.addInitScript(() => localStorage.setItem('nav-mode', 'avanzado'));
  await montar(page);
  let ocultos = o.ocultos ?? [];
  const cuenta = {
    activo: 0, gets: 0, puts: [] as Record<string, unknown>[],
    /** Otra pestaña u otro dispositivo cambia el menú en el servidor. */
    otroDispositivo: (nuevos: string[]) => { ocultos = nuevos; },
    /** Resuelve cuando ha contestado el interruptor: «no se ve» antes de eso no prueba nada. */
    respondido: page.waitForResponse(r => r.url().includes('/api/configuracion/tu-tentare')).then(() => undefined),
  };
  // Después de `montar`: gana a sus comodines.
  await page.route('**/api/configuracion/tu-tentare', r => { cuenta.activo++; return json(r, o.activo ?? { activo: true }, o.status ?? 200); });
  await page.route('**/api/billing/status**', r => json(r, { activo: true, plan: o.plan ?? 'ESTUDIO', configurado: true, bloqueado: false }));
  await page.route('**/api/layout**', async r => {
    if (r.request().method() === 'PUT') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      cuenta.puts.push(cuerpo);
      if (o.put) return o.put(r, cuerpo);
      ocultos = (cuerpo.ocultos as string[]) ?? ocultos;
      // El PUT real devuelve la configuración entera ya fusionada.
      return json(r, { ...LAYOUT, ocultos });
    }
    cuenta.gets++;
    if (o.lecturaFalla) return json(r, { error: 'boom' }, 500);
    return json(r, { ...LAYOUT, ocultos });
  });
  await ir(page, 'configuracion?tab=panel');
  return cuenta;
}

const fila = (page: Page, href: string) => page.locator(`[data-testid="modulo-tu-tentare"][data-modulo="${href}"]`);
const enElMenu = (page: Page, nombre: string) => page.locator('aside').getByRole('link', { name: nombre, exact: true });

test.describe('Configuración · Tu Tentare', () => {
  test.describe.configure({ timeout: 180_000 });

  test('apagado, o con cualquier respuesta rara: «Tu panel» es exactamente la de antes', async ({ page }) => {
    for (const caso of [{ activo: { activo: false } }, { activo: {} }, { activo: { error: 'x' }, status: 500 }]) {
      const cuenta = await abrir(page, caso);
      await expect(page.locator('#menu-del-panel')).toBeVisible({ timeout: 60_000 });
      await cuenta.respondido;
      await expect.poll(() => cuenta.activo).toBeGreaterThan(0);
      // Dos fotogramas: lo que la página hace con la respuesta ya está pintado.
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await expect(page.getByTestId('tu-tentare')).toHaveCount(0);
    }
  });

  test('encendido: todos los módulos del menú, con su frase; nada congelado ni «próximamente»; lo fijo no se quita', async ({ page }) => {
    await abrir(page);
    const tu = page.getByTestId('tu-tentare');
    await expect(tu.getByRole('heading', { name: 'Tus módulos' })).toBeVisible({ timeout: 60_000 });
    await expect(tu.getByTestId('modulo-tu-tentare')).toHaveCount(20);
    for (const congelado of ['Chat de equipo', 'Oferta digital', 'Tentare Network']) await expect(tu.getByText(congelado)).toHaveCount(0);
    await expect(tu.getByText(/próximamente/i)).toHaveCount(0);
    await expect(tu.getByText('No se puede quitar')).toHaveCount(3);
    await expect(fila(page, '/cobros').getByText(/Con tarjeta guardada se cobra sola; las domiciliaciones van en tu remesa al banco/)).toBeVisible();
    // La sección de siempre sigue debajo.
    await expect(page.locator('#menu-del-panel')).toBeVisible();
  });

  test('quitar un módulo manda SOLO `ocultos` y el menú lo pierde sin recargar; ponerlo lo devuelve', async ({ page }) => {
    const cuenta = await abrir(page);
    await expect(fila(page, '/informes')).toBeVisible({ timeout: 60_000 });
    await expect(enElMenu(page, 'Informes')).toBeVisible();
    const interruptor = fila(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect(cuenta.puts).toEqual([{ ocultos: ['/informes'] }]);
    await expect(enElMenu(page, 'Informes')).toHaveCount(0);

    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    expect(cuenta.puts[1]).toEqual({ ocultos: [] });
    await expect(enElMenu(page, 'Informes')).toBeVisible();
  });

  test('si guardar falla (400, 500 o sin red), el interruptor vuelve a su sitio, lo dice y el menú no cambia', async ({ page }) => {
    for (const falla of [
      (r: Route) => json(r, { error: 'Datos inválidos' }, 400),
      (r: Route) => json(r, { error: 'boom' }, 500),
      (r: Route) => r.abort(),
    ]) {
      const cuenta = await abrir(page, { put: falla });
      const interruptor = fila(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
      await expect(interruptor).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 });
      await interruptor.click();
      await expect(fila(page, '/informes').getByRole('alert')).toBeVisible();
      await expect(interruptor).toHaveAttribute('aria-checked', 'true');
      await expect(enElMenu(page, 'Informes')).toBeVisible();
      expect(cuenta.puts.length).toBeGreaterThan(0);
    }
  });

  test('si no se puede leer el menú, lo dice, no afirma qué está puesto y no deja cambiar nada (ni una escritura)', async ({ page }) => {
    const cuenta = await abrir(page, { lecturaFalla: true });
    await expect(page.getByTestId('tu-tentare').getByRole('alert')).toContainText('No hemos podido leer tu menú', { timeout: 60_000 });
    expect(cuenta.gets).toBeGreaterThan(0);
    // Sin el menú leído no hay interruptor: un «Informes en el menú, activado»
    // sobre un módulo que quizá esté escondido sería mentira.
    await expect(fila(page, '/informes')).toBeVisible();
    await expect(fila(page, '/informes').getByRole('switch')).toHaveCount(0);
    await expect(page.getByTestId('tu-tentare').getByRole('switch')).toHaveCount(0);
    expect(cuenta.puts).toHaveLength(0);
  });

  test('con el cajón «Tu menú» abierto, los interruptores esperan (escriben el mismo dato)', async ({ page }) => {
    const cuenta = await abrir(page);
    const interruptor = fila(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
    await expect(interruptor).toBeEnabled({ timeout: 60_000 });
    await page.locator('#menu-del-panel').click();
    await expect(interruptor).toBeDisabled();
    await interruptor.click({ force: true });
    await page.keyboard.press('Escape');
    await expect(interruptor).toBeEnabled();
    expect(cuenta.puts).toHaveLength(0);
  });

  test('si otro dispositivo cambió el menú, quitar uno aquí no deshace lo suyo', async ({ page }) => {
    const cuenta = await abrir(page);
    await expect(fila(page, '/informes')).toBeVisible({ timeout: 60_000 });
    // Mientras esta pestaña estaba abierta, en otra se quitó la Libreta.
    cuenta.otroDispositivo(['/libreta']);
    await fila(page, '/informes').getByRole('switch').click();
    await expect(fila(page, '/informes').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(cuenta.puts).toEqual([{ ocultos: ['/libreta', '/informes'] }]);
  });

  test('con el guardado en vuelo, un segundo toque no manda otra petición', async ({ page }) => {
    let soltar: () => void = () => {};
    const cuenta = await abrir(page, {
      put: (r, cuerpo) => new Promise<void>(res => { soltar = () => { void json(r, { ...LAYOUT, ocultos: cuerpo.ocultos }).then(res); }; }),
    });
    const interruptor = fila(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
    await expect(interruptor).toBeVisible({ timeout: 60_000 });
    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-busy', 'true');
    // El primer PUT ya ha llegado (el `aria-busy` se pone antes de la lectura que lo precede).
    await expect.poll(() => cuenta.puts.length).toBe(1);
    await interruptor.click({ force: true });
    await fila(page, '/libreta').getByRole('switch').click({ force: true });
    expect(cuenta.puts).toHaveLength(1);
    soltar();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    expect(cuenta.puts).toHaveLength(1);
  });

  test('plan Founding: Centro de Control dice qué plan necesita y se pone y se quita igual que en el cajón', async ({ page }) => {
    const cuenta = await abrir(page, { plan: 'BASE', ocultos: ['/centro-de-control'] });
    const cdc = fila(page, '/centro-de-control');
    await expect(cdc.getByText('Desde el plan Estudio')).toBeVisible({ timeout: 60_000 });
    // La misma cifra que la fila «Tu menú»: 20 módulos (con Festivos, 14-oct), uno quitado.
    await expect(page.getByText('En tu menú: 19 de 20.')).toBeVisible();
    await expect(cdc.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/suscripcion');
    await cdc.getByRole('switch').click();
    await expect(cdc.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(cuenta.puts).toEqual([{ ocultos: [] }]);
  });

  test('con el menú en «Esencial»: lo dice, y «Poner el menú en «Todo»» lo cambia sin recargar', async ({ page }) => {
    await abrir(page);
    await expect(fila(page, '/sustituciones').getByText('Lo verás al poner el menú en «Todo».')).toBeVisible({ timeout: 60_000 });
    await expect(enElMenu(page, 'Sustituciones')).toHaveCount(0);
    await page.getByRole('button', { name: 'Poner el menú en «Todo»' }).click();
    await expect(enElMenu(page, 'Sustituciones')).toBeVisible();
    await expect(fila(page, '/sustituciones').getByText('Lo verás al poner el menú en «Todo».')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('nav-mode'))).toBe('avanzado');
    // Y se puede volver desde aquí (en el móvil no hay otro sitio).
    await page.getByRole('button', { name: 'Volver a «Esencial»' }).click();
    await expect(enElMenu(page, 'Sustituciones')).toHaveCount(0);
  });

  test('el selector Esencial/Todo del menú lateral también pone al día la lista', async ({ page }) => {
    await abrir(page);
    await expect(fila(page, '/sustituciones').getByText('Lo verás al poner el menú en «Todo».')).toBeVisible({ timeout: 60_000 });
    await page.locator('aside').getByRole('button', { name: 'Todo', exact: true }).click();
    await expect(fila(page, '/sustituciones').getByText('Lo verás al poner el menú en «Todo».')).toHaveCount(0);
    await expect(page.getByText('En este navegador tienes el menú en «Todo».')).toBeVisible();
  });

  test('«Abrir y ver cómo se usa» lleva a la pantalla con su tutorial abierto (también a un estudio que ya trabajaba)', async ({ page }) => {
    await abrir(page, { modo: 'avanzado' });
    await fila(page, '/calendario').getByRole('link', { name: 'Abrir y ver cómo se usa' }).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/calendario/, { timeout: 60_000 });
    await expect(page.getByTestId('tutorial-tarjeta')).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('Configuración · Tu Tentare, móvil', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('a 390 px no hay scroll lateral y los interruptores están a mano', async ({ page }) => {
    await abrir(page);
    await expect(page.getByTestId('tu-tentare')).toBeVisible({ timeout: 60_000 });
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(ancho).toBeLessThanOrEqual(0);
    const caja = await fila(page, '/informes').getByRole('switch').boundingBox();
    expect(caja && caja.x + caja.width).toBeLessThanOrEqual(390);
    // Todo lo que se toca mide al menos 44 px (como en el resto de Configuración en táctil).
    const pequenos = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="tu-tentare"] a, [data-testid="tu-tentare"] button, [data-testid="tu-tentare"] [role="switch"]')]
      .flatMap(el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return [];
        const antes = getComputedStyle(el, '::before');
        const px = (v: string) => parseFloat(v) || 0;
        let ancho = r.width; let alto = r.height;
        if (antes.position === 'absolute') {
          ancho = Math.max(ancho, r.width - px(antes.left) - px(antes.right));
          alto = Math.max(alto, r.height - px(antes.top) - px(antes.bottom));
        }
        return alto >= 43.5 ? [] : [`${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)} ${Math.round(ancho)}×${Math.round(alto)}`];
      }));
    expect(pequenos).toEqual([]);
  });
});
