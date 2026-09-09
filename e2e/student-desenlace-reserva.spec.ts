import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, sembrarSociaLista } from './socia-lista';

// Los desenlaces de una reserva: lo que la alumna ve cuando el servidor
// contesta, y a dónde la lleva el botón.
//
// ⚠️ Lo que se comprueba aquí no es el copy —eso ya estaba bien— sino que la
// ETIQUETA del botón y el DESTINO digan lo mismo. Dos no lo decían:
//
//  · `session-expired` ponía «Iniciar sesión» y navegaba al HORARIO. Acababa en
//    el acceso igualmente porque la guardia de sesión rebota, pero por accidente
//    y enseñando de paso una pantalla que nadie pidió. La ficha de clase ya lo
//    hacía bien: era esta pantalla la que se desviaba.
//  · `waitlisted` ponía «Volver al horario» y navegaba a MIS CLASES. La
//    etiqueta salía de la bandera del confeti (`ok`), que solo es cierta para
//    `confirmed`, en vez de salir de a dónde va.

const base = `/portal/${SLUG}`;

/** Qué promete cada etiqueta, y dónde tiene que acabar. */
const DESENLACES: Array<{ estado: string; etiqueta: RegExp; destino: RegExp }> = [
  { estado: 'confirmed', etiqueta: /Ver mis reservas/, destino: /\/mis-reservas$/ },
  { estado: 'waitlisted', etiqueta: /Ver mis reservas/, destino: /\/mis-reservas$/ },
  { estado: 'session-expired', etiqueta: /Iniciar sesión/, destino: /\/acceso\/login/ },
  { estado: 'full', etiqueta: /Volver al horario/, destino: /\/reservar$/ },
  { estado: 'conflict', etiqueta: /Volver al horario/, destino: /\/reservar$/ },
  { estado: 'duplicate', etiqueta: /Volver al horario/, destino: /\/reservar$/ },
  { estado: 'error', etiqueta: /Volver al horario/, destino: /\/reservar$/ },
  { estado: 'offline', etiqueta: /Volver al horario/, destino: /\/reservar$/ },
];

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  // ⚠️ Explícita y DESPUÉS de `sembrarSociaLista`: registrar rutas por predicado
  // detrás de sus globs deja `/api/public/session` sin contestar, y la guardia
  // de sesión se queda en «Cargando…» para siempre.
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

test.describe('Student PWA · desenlace de una reserva', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  for (const { estado, etiqueta, destino } of DESENLACES) {
    test(`«${estado}»: el botón lleva a donde dice que lleva`, async ({ page }) => {
      await montar(page);
      await page.goto(`${base}/reservar/confirmacion?state=${estado}`, { waitUntil: 'domcontentloaded' });
      const boton = page.getByRole('button', { name: etiqueta });
      await expect(boton, `no aparece el botón ${etiqueta}`).toBeVisible({ timeout: 30_000 });
      await boton.click();
      await expect(page, `«${estado}» promete ${etiqueta} y acaba en otro sitio`).toHaveURL(destino, { timeout: 15_000 });
    });
  }

  test('sin parámetro NO se enseña una confirmación que nadie ha confirmado', async ({ page }) => {
    // Regla del repo: el paquete de diseño cae en `confirmed` por defecto; aquí
    // un valor ausente o inventado cae en `error`.
    await montar(page);
    await page.goto(`${base}/reservar/confirmacion`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Algo no ha salido como esperábamos')).toBeVisible({ timeout: 30_000 });
    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain('Reserva confirmada');
    // Y dice que no se ha gastado nada, que es lo que de verdad tranquiliza.
    expect(texto).toContain('no se ha usado ninguna sesión');
  });
});
