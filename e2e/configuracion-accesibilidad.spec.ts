import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { SECCIONES } from '../lib/configuracion/secciones';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración se recorre sin ver la pantalla y sin perderse.
//
// Una lista que abre un detalle a pantalla completa es fácil de hacer mal: el
// lector de pantalla se queda leyendo la lista que ya no se ve, «Volver» deja
// el foco arriba del todo y hay que recorrer once filas otra vez para seguir
// donde se estaba. Aquí se fija (§5 y §6.7 de la reorganización):
//   · abrir una sección lleva el foco a su título;
//   · volver devuelve el foco a la fila que la abrió, con la flecha y con el
//     gesto de atrás del teléfono;
//   · la columna de pantalla ancha no roba el foco al enlace pulsado;
//   · llegar por un ancla pone el foco en el título de esa tarjeta;
//   · los interruptores son interruptores (`role="switch"`) con nombre;
//   · los títulos no se saltan niveles.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  nif: 'B12345678', plan: 'ESTUDIO', subscription_status: 'active',
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function panel(page: Page) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

test.describe('En el móvil: lista, sección y vuelta', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('abrir una sección enfoca su título, y volver devuelve el foco a su fila', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion');
    const fila = page.locator('#lista-seccion-reservas');
    await expect(fila).toBeVisible({ timeout: 30_000 });
    const historial = await page.evaluate(() => history.length);

    await fila.click();
    await expect(titulo(page, 'Cómo reservan mis alumnas')).toBeFocused({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/configuracion\?tab=reservas$/);
    // `push`: el gesto de atrás del teléfono tiene que poder volver a la lista.
    expect(await page.evaluate(() => history.length)).toBe(historial + 1);
    // La lista no se queda debajo, leyéndose sin verse.
    await expect(fila).toBeHidden();

    await page.getByRole('button', { name: 'Volver a Configuración' }).click();
    await expect(fila).toBeVisible();
    await expect(fila).toBeFocused();
    await expect(page).toHaveURL(/\/configuracion$/);
  });

  test('el gesto de atrás del teléfono también vuelve a la lista', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion');
    const fila = page.locator('#lista-seccion-cobros');
    await expect(fila).toBeVisible({ timeout: 30_000 });

    await fila.click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });
    // El título se pinta en el mismo render; la entrada del historial la escribe
    // el router justo después. Un atrás antes de eso saldría del panel, y ningún
    // dedo es tan rápido: se espera a que la URL diga dónde se está.
    await expect(page).toHaveURL(/\/configuracion\?tab=cobros$/);
    await page.goBack();
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/configuracion$/);
  });

  test('llegando por un enlace, la flecha lleva a la lista sin salir de Configuración', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=altas');
    await expect(titulo(page, 'Alta de alumnas')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Volver a Configuración' }).click();
    await expect(page.getByRole('navigation', { name: 'Secciones de Configuración' })).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion$/);
  });
});

test.describe('En pantalla ancha', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('la columna es de enlaces: Intro navega y el foco se queda en el enlace', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion');
    const enlace = page.getByRole('navigation', { name: 'Secciones de Configuración' })
      .getByRole('link', { name: 'Mis clases y citas', exact: true });
    await expect(enlace).toBeVisible({ timeout: 30_000 });

    await enlace.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/configuracion\?tab=clases$/);
    await expect(titulo(page, 'Mis clases y citas')).toBeVisible();
    await expect(enlace).toHaveAttribute('aria-current', 'page');
    await expect(enlace).toBeFocused();
  });

  test('llegando por un enlace, cambiar de sección cambia también la dirección', async ({ page }) => {
    // Solo falla en el build de producción (#2030): Next guardaba al cargar la
    // ruta con la URL de llegada, y una navegación del router a otra sección
    // reescribía `?tab=altas`. La sección cambiaba y la barra no.
    await panel(page);
    await ir(page, 'configuracion?tab=altas');
    await expect(titulo(page, 'Alta de alumnas')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('navigation', { name: 'Secciones de Configuración' })
      .getByRole('link', { name: 'Cobros y facturas', exact: true }).click();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible();
    await expect(page).toHaveURL(/\/configuracion\?tab=cobros$/);

    await page.reload();
    await expect(titulo(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });
  });

  test('llegar por el ancla de una tarjeta pone el foco en su título', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=cobros#devoluciones');
    await expect(page.locator('#devoluciones-titulo')).toBeFocused({ timeout: 30_000 });
    await expect(page.locator('#devoluciones')).toBeInViewport();
  });

  test('los interruptores son interruptores, se cambian con la barra espaciadora y esperan a «Guardar»', async ({ page }) => {
    let escrituras = 0;
    await panel(page);
    await page.route('**/rest/v1/studios**', r => {
      if (r.request().method() !== 'GET') escrituras++;
      return json(r, STUDIO);
    });
    await ir(page, 'configuracion?tab=reservas');

    const exigir = page.getByRole('switch', { name: /Exigir plan o bono activo/ });
    await expect(exigir).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
    await exigir.focus();
    await page.keyboard.press('Space');
    await expect(exigir).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
    expect(escrituras, 'cambiar el interruptor no escribe hasta «Guardar»').toBe(0);
  });

  test('en cada sección los títulos no se saltan niveles y cada interruptor tiene nombre', async ({ page }) => {
    test.setTimeout(180_000);
    await panel(page);
    const fallos: string[] = [];

    for (const seccion of SECCIONES) {
      await ir(page, `configuracion?tab=${seccion.id}`);
      await expect(titulo(page, seccion.titulo)).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);

      const { niveles, sinNombre } = await page.evaluate(() => {
        const raiz = document.querySelector('[data-tour="configuracion-vista"]')!;
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const niveles = [...raiz.querySelectorAll('h1, h2, h3, h4, h5, h6')]
          .filter(visible)
          .map(h => `${h.tagName[1]}:${(h.textContent ?? '').trim().slice(0, 30)}`);
        const sinNombre = [...raiz.querySelectorAll<HTMLElement>('[role="switch"]')]
          .filter(visible)
          .filter(s => {
            const nombre = s.getAttribute('aria-label')
              ?? s.closest('label')?.textContent
              ?? (s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby')!)?.textContent);
            return !nombre || !nombre.trim();
          })
          .map(s => s.outerHTML.slice(0, 80));
        return { niveles, sinNombre };
      });

      if (!niveles[0]?.startsWith('1:')) fallos.push(`${seccion.id}: no empieza por el h1 (${niveles[0]})`);
      for (let i = 1; i < niveles.length; i++) {
        const antes = Number(niveles[i - 1][0]);
        const ahora = Number(niveles[i][0]);
        if (ahora > antes + 1) fallos.push(`${seccion.id}: salta de «${niveles[i - 1]}» a «${niveles[i]}»`);
      }
      for (const s of sinNombre) fallos.push(`${seccion.id}: interruptor sin nombre ${s}`);
    }

    expect(fallos, `\n${fallos.join('\n')}\n`).toEqual([]);
  });
});
