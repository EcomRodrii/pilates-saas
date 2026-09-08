import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// El escaparate de productos FÍSICOS del estudio.
//
// La restricción que manda sobre todo el diseño: se compran EN EL ESTUDIO, no
// por la app. No hay envíos y no hay checkout — no existe nada detrás que
// aparte la unidad ni que sepa que hay que entregarla en mano. Cobrar sin eso
// es exactamente el patrón que este repo lleva meses quitando (el canje que
// nadie entregaba, la reserva que decía sí y era no).
//
// Por eso los dos primeros tests son sobre lo que NO hay: ningún botón de
// comprar, y el aviso visible antes de que a nadie le apetezca buscarlo. Si un
// día alguien "completa" la sección añadiéndole un botón, esto salta.
// ─────────────────────────────────────────────────────────────────────────────

const base = `/portal/${SLUG}`;

const PRODUCTOS = [
  { id: 'pf1', nombre: 'Calcetines antideslizantes', precio: 12, descripcion: 'Talla única.', imagenUrl: null },
  { id: 'pf2', nombre: 'Botella de agua', precio: 5, descripcion: null, imagenUrl: null },
];

const PLAN = {
  id: 'plan-1', studioId: STUDIO_ID, nombre: 'Bono 10 clases', tipo: 'BONO',
  precio: 100, sesiones: 10, activo: true, validezDias: 60,
};

async function montar(page: Page, ajustar?: (f: Record<string, unknown>) => void) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [PLAN];
  f.citasServicios = [];
  f.productosFisicos = PRODUCTOS;
  ajustar?.(f);
  await page.route('**/api/public/studio-data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
}

test.describe('Productos físicos en «Comprar»', () => {
  test('se ven con su nombre y su precio, los últimos', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`);

    await expect(page.getByText('Calcetines antideslizantes')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Botella de agua')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'En el estudio' })).toBeVisible();

    // Los últimos: lo que hace crecer al estudio es que reserve, no que compre
    // calcetines. Se comprueba por posición REAL en el documento, no por
    // confianza — y comparando índices sobre el texto de la página, sin
    // constantes del DOM: `Node` no existe en el contexto de Node.js donde
    // corre el test, solo dentro de `evaluate`.
    const texto = await page.locator('body').innerText();
    expect(texto.indexOf('Bono 10 clases')).toBeGreaterThan(-1);
    expect(texto.indexOf('Calcetines antideslizantes'))
      .toBeGreaterThan(texto.indexOf('Bono 10 clases'));
  });

  test('NO hay botón de comprar en un producto físico', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`);
    await expect(page.getByText('Calcetines antideslizantes')).toBeVisible({ timeout: 30_000 });

    // El plan sí lo tiene; el producto no. Un «Comprar» que abriera un cobro
    // sería mentira —no hay fulfilment detrás— y uno que no hiciera nada, peor.
    const tarjeta = page.locator('article').filter({ hasText: 'Calcetines antideslizantes' });
    await expect(tarjeta.getByRole('button', { name: /comprar|contratar/i })).toHaveCount(0);
    const tarjetaBono = page.locator('article').filter({ hasText: 'Bono 10 clases' });
    await expect(tarjetaBono.getByRole('button', { name: /comprar/i })).toBeVisible();
  });

  test('el aviso de que se compran en el estudio se lee en la sección', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`);
    const aviso = page.getByTestId('aviso-productos');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText(/se compran en el estudio/i);
    await expect(aviso).toContainText(/no hacemos envíos/i);
  });

  test('sin productos activos, la sección no existe', async ({ page }) => {
    // Un estudio que no vende nada físico no debe ver un título vacío.
    await montar(page, (f) => { f.productosFisicos = []; });
    await page.goto(`${base}/comprar`);
    await expect(page.getByText('Bono 10 clases')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'En el estudio' })).toHaveCount(0);
    await expect(page.getByTestId('aviso-productos')).toHaveCount(0);
  });
});
