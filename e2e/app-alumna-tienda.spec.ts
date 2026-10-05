import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La tienda de la app de la alumna que se lee sin hacer cuentas (P09): el nombre
// entero, el precio grande y por clase, cuánto ahorra si es verdad, hasta QUÉ
// DÍA vale si lo compra hoy, para qué clases sirve y el importe en el botón.
//
// Las cifras salen del mismo cálculo que el cobro (`lib/student/tienda.ts`, con
// sus tests); aquí se comprueba que la pantalla las enseña, y que el botón con
// el importe abre la compra de ESE plan sin mandar ningún importe: lo pone el
// servidor. Con contador, para que «no mandó importe» no sea «no mandó nada».

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const NOMBRE_LARGO = 'Bono 10 clases de mañana y de tarde en todas las salas del estudio';

const PLANES = [
  { id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual 2 días', tipo: 'MENSUAL', sesiones: null, precio: 69, activo: true, periodicidadMeses: 1, limiteSemanal: 2, tiposClaseIds: ['tc-r', 'tc-m'] },
  { id: 'plan-bono10', studioId: STUDIO_ID, nombre: NOMBRE_LARGO, tipo: 'BONO', sesiones: 10, precio: 136, activo: true, validezDias: 150 },
  { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 20, activo: true, validezDias: 30 },
];

async function montar(page: Page) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = PLANES;
  f.tiposClase = [
    { id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
    { id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#6B7A64', nivel: 'TODOS', ventanaCancelacionHoras: null },
  ];
  (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test_123';
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' })));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  // El cobro: se cuenta y se guarda lo que pide. Contesta con un error para que
  // la hoja no intente montar Stripe (que en pruebas no carga).
  const cobros: Record<string, unknown>[] = [];
  await page.route('**/api/public/checkout-embebido', (r) => {
    cobros.push(r.request().postDataJSON() ?? {});
    return r.fulfill(json({ error: 'Pagos en pruebas' }, 500));
  });
  return cobros;
}

test.describe('App de la alumna · tienda', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('cada tarjeta dice precio, precio por clase, ahorro, fecha, para qué clases y el importe en el botón', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });

    const bono = page.locator('article').filter({ hasText: NOMBRE_LARGO });
    await expect(bono).toBeVisible({ timeout: 60_000 });
    // El nombre ENTERO, sin cortar: ni puntos suspensivos ni desbordado.
    const titulo = bono.getByRole('heading', { name: NOMBRE_LARGO });
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((h) => h.scrollWidth <= h.clientWidth && getComputedStyle(h).textOverflow !== 'ellipsis')).toBe(true);

    await expect(bono.getByTestId('precio')).toHaveText('136 €');
    await expect(bono.getByTestId('precio-por-clase')).toHaveText('13,60 €/clase');
    // 13,60 € frente a los 20 € de la suelta del estudio: un 32 %, hacia abajo.
    await expect(bono.getByTestId('ahorro')).toHaveText(' · ahorras un 32 %');
    // 12 de agosto + 150 días, el mismo día que escribe el cobro.
    await expect(bono.getByTestId('vigencia')).toHaveText('Vale 150 días: si lo compras hoy, hasta el 9 de enero');
    await expect(bono.getByTestId('cobertura')).toHaveText('Para todas las clases');
    await expect(bono.getByRole('button', { name: 'Comprar · 136 €' })).toBeVisible();

    const cuota = page.locator('article').filter({ hasText: 'Cuota mensual 2 días' });
    await expect(cuota.getByTestId('precio')).toHaveText('69 €/mes');
    // Una cuota no tiene precio por clase (dependería de cuántas vaya) ni caduca.
    await expect(cuota.getByTestId('precio-por-clase')).toHaveCount(0);
    await expect(cuota.getByTestId('vigencia')).toHaveCount(0);
    await expect(cuota.getByTestId('renovacion')).toHaveText('Se renueva sola cada mes hasta que te des de baja.');
    await expect(cuota.getByTestId('cobertura')).toHaveText('Para Reformer y Mat');
    await expect(cuota.getByRole('button', { name: 'Contratar · 69 €/mes' })).toBeVisible();

    // La suelta es la referencia: ni «ahorras» ni precio por clase, pero sí su caducidad.
    const suelta = page.locator('article').filter({ hasText: 'Clase suelta' });
    await expect(suelta.getByTestId('ahorro')).toHaveCount(0);
    await expect(suelta.getByTestId('vigencia')).toHaveText('Vale 30 días: si lo compras hoy, hasta el 11 de septiembre');
    await expect(suelta.getByRole('button', { name: 'Comprar · 20 €' })).toBeVisible();
  });

  test('el botón con el importe compra ESE plan y no manda ningún importe', async ({ page }) => {
    const cobros = await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.locator('article').filter({ hasText: NOMBRE_LARGO })
      .getByRole('button', { name: 'Comprar · 136 €' }).click({ timeout: 60_000 });
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar al pago' }).click();

    await expect.poll(() => cobros.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(cobros[0]).toMatchObject({ planId: 'plan-bono10', studioId: STUDIO_ID });
    // El importe lo decide el servidor leyendo el plan, nunca el botón.
    expect(cobros[0]).not.toHaveProperty('importe');
    expect(cobros[0]).not.toHaveProperty('precio');
  });
});
