import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La burbuja de ayuda por WhatsApp no tapa lo que hay que tocar.
//
// En capturas del móvil y del iPad salía encima de filas de listas y de
// tarjetas, y encima de «Guardar». Iba a `bottom-20` fijos, sin contar la zona
// segura (en un iPhone o un iPad con barra de inicio quedaba sobre la navegación
// de abajo), y el panel dejaba debajo del contenido justo su alto, ni un píxel de
// más. Lo que se fija aquí:
//   · queda por encima de la navegación de abajo;
//   · al final de la página, la última fila y la última tarjeta quedan por
//     encima de ella;
//   · un campo enfocado no queda debajo;
//   · con una barra de guardar a la vista, se aparta.
//
// ⚠️ Playwright no simula la zona segura de iOS (vale 0): el cálculo con
// `env(safe-area-inset-bottom)` hay que mirarlo en un iPhone y un iPad de verdad.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
  plan: 'ESTUDIO', subscription_status: 'active',
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function panel(page: Page) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const burbuja = (page: Page) => page.getByRole('button', { name: 'Ayuda por WhatsApp' });
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

type Caja = { x: number; y: number; width: number; height: number };
const seSolapan = (a: Caja, b: Caja) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const VISTAS = [
  { nombre: 'móvil 375×812', viewport: { width: 375, height: 812 }, columna: false },
  { nombre: 'iPad vertical 768×1024', viewport: { width: 768, height: 1024 }, columna: true },
] as const;

for (const vista of VISTAS) {
  test.describe(`La burbuja de WhatsApp en ${vista.nombre}`, () => {
    test.use({ viewport: vista.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test('queda por encima de la navegación de abajo', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion');
      await expect(burbuja(page)).toBeVisible({ timeout: 30_000 });

      const navArriba = await page.evaluate(() => {
        const nav = [...document.querySelectorAll('nav')].find(n => {
          const cs = getComputedStyle(n);
          return cs.position === 'fixed' && cs.display !== 'none' && n.getBoundingClientRect().bottom >= window.innerHeight - 1;
        });
        return nav ? nav.getBoundingClientRect().top : null;
      });
      expect(navArriba, 'la navegación de abajo').not.toBeNull();
      const caja = (await burbuja(page).boundingBox())!;
      expect(caja.y + caja.height, 'la burbuja, encima de la navegación').toBeLessThanOrEqual(navArriba! - 8);
    });

    test('al final de la página no tapa la última fila ni la última tarjeta', async ({ page }) => {
      await panel(page);
      // En el móvil, la lista de secciones; en el iPad, una sección larga.
      await ir(page, vista.columna ? 'configuracion?tab=cobros' : 'configuracion');
      await expect(burbuja(page)).toBeVisible({ timeout: 30_000 });
      if (vista.columna) await expect(titulo(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);

      const ultimo = vista.columna
        ? page.locator('section[aria-labelledby="seccion-titulo"] [data-tarjeta-ajuste]').last()
        // En el móvil, la pantalla de lista es el inicio: su último grupo de filas.
        : page.locator('[aria-labelledby^="inicio-grupo-"] [data-tarjeta-ajuste]').last();
      await expect(ultimo).toBeInViewport();
      const caja = (await ultimo.boundingBox())!;
      const b = (await burbuja(page).boundingBox())!;
      expect(seSolapan(caja, b), `la burbuja (${Math.round(b.y)}) tapa el final (${Math.round(caja.y + caja.height)})`).toBe(false);
    });

    // Desde el 15-sep (v2) los campos de Mi estudio, Cobros y facturas y Cómo
    // reservan mis alumnas van en un cajón. La burbuja sigue ahí debajo (sin
    // cambios no hay barra que la aparte): lo que se fija es que el cajón queda
    // POR ENCIMA, y que lo que hay en la esquina de cada campo enfocado —donde
    // cae la burbuja— es el campo, no ella.
    test('un campo enfocado no queda debajo de la burbuja', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion?tab=reservas');
      await page.locator('#reservar').click({ timeout: 30_000 });
      const cajon = page.getByRole('dialog');
      const primero = cajon.getByLabel('Días antes de la clase en que se abre la reserva');
      await expect(primero).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => {
        const b = await cajon.boundingBox();
        return b ? Math.round(b.x + b.width) : null;
      }).toBe(vista.viewport.width);
      await expect(page.getByRole('button', { name: 'Ayuda por WhatsApp' })).toBeAttached();

      await primero.focus();
      const tapados: string[] = [];
      let medidos = 0;
      for (let i = 0; i < 20; i++) {
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el?.closest('[role="dialog"]') || !el.matches('input, select, textarea')) return null;
          const c = el.getBoundingClientRect();
          // El centro y la esquina de abajo a la derecha, que es donde cae la burbuja.
          const puntos: [number, number][] = [[c.left + c.width / 2, c.top + c.height / 2], [c.right - 12, c.bottom - 12]];
          const tapa = puntos.some(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.panel-wa-fab'));
          return tapa ? `${el.getAttribute('aria-label') || el.id || el.tagName} (${Math.round(c.bottom)})` : '';
        });
        if (r !== null) {
          medidos++;
          if (r) tapados.push(r);
        }
        await page.keyboard.press('Tab');
      }
      // Verde por vacío no: tiene que haber recorrido campos de verdad.
      expect(medidos, 'campos recorridos en el cajón').toBeGreaterThan(2);
      expect(tapados, `\n${tapados.join('\n')}\n`).toEqual([]);
    });

    test('con la barra de guardar a la vista, la burbuja se aparta', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion?tab=marca');
      const telefono = page.getByRole('textbox', { name: 'Tu lema' });
      await expect(telefono).toBeVisible({ timeout: 30_000 });
      await expect(burbuja(page)).toBeVisible();

      await telefono.fill('Cuerpo y mente');
      await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
      await expect(burbuja(page)).toBeHidden();

      await page.getByRole('button', { name: 'Descartar' }).click();
      await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0);
      await expect(burbuja(page)).toBeVisible();
    });

    // En Marca, un campo alto enfocado caía debajo de la burbuja aunque aún no
    // hubiera cambios (sin barra que la apartara): mientras se escribe, se aparta.
    test('en Marca, mientras se escribe en un campo, la burbuja se aparta', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion?tab=marca');
      const lema = page.getByRole('textbox', { name: 'Tu lema' });
      await expect(lema).toBeVisible({ timeout: 30_000 });
      await expect(burbuja(page)).toBeVisible();

      await lema.focus();
      await expect(page.getByText('Tienes cambios sin guardar.')).toHaveCount(0);
      await expect(burbuja(page)).toBeHidden();

      await lema.evaluate(el => (el as HTMLElement).blur());
      await expect(burbuja(page)).toBeVisible();
    });
  });
}

// En escritorio también se aparta. Se creía que, sin navegación abajo, la barra
// quedaba a la izquierda de la burbuja; a 1024 px la columna es estrecha y la
// burbuja tapaba «Guardar» (captura del 15-sep).
for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }]) {
  test.describe(`La burbuja de WhatsApp en escritorio ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test('con la barra de guardar a la vista se aparta, y vuelve al descartar', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion?tab=marca');
      const telefono = page.getByRole('textbox', { name: 'Tu lema' });
      await expect(telefono).toBeVisible({ timeout: 30_000 });
      await expect(burbuja(page)).toBeVisible();

      await telefono.fill('Cuerpo y mente');
      await expect(page.getByText('Tienes cambios sin guardar.')).toBeVisible();
      await expect(burbuja(page)).toBeHidden();

      await page.getByRole('button', { name: 'Descartar' }).click();
      await expect(burbuja(page)).toBeVisible();
    });
  });
}
