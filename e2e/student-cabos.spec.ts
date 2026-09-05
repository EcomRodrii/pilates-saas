import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Los cabos sueltos del backlog de la auditoría: cosas que la app se callaba,
// decía mal, o dejaba tocar de una forma que no acertaba el dedo.

const base = `/portal/${SLUG}`;

async function montar(page: Page, ajustar?: (f: Record<string, unknown>) => void) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  ajustar?.(f);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/api/notifications/preferences**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prefs: {} }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
}

/** Dos bonos: uno acotado a Reformer y otro que sirve para cualquier clase. */
function conBonosAcotados(f: Record<string, unknown>) {
  f.planesTarifa = [
    { id: 'plan-ref', studioId: STUDIO_ID, nombre: 'Bono Reformer', precio: 70, sesiones: 5, activo: true, tipo: 'BONO', tiposClaseIds: ['tc-r'] },
    { id: 'plan-todo', studioId: STUDIO_ID, nombre: 'Bono abierto', precio: 60, sesiones: 5, activo: true, tipo: 'BONO', tiposClaseIds: [] },
  ];
}

test.describe('Student PWA · cabos sueltos de la auditoría', () => {
  test('la tienda dice a qué tipo de clase está acotado un bono, ANTES de pagar', async ({ page }) => {
    // Lo decidía el servidor (`planCubreTipoClase`) y la tienda se lo callaba:
    // el bono se compraba, y el rechazo llegaba al ir a reservar.
    await montar(page, conBonosAcotados);
    await page.goto(`${base}/comprar`);
    await expect(page.getByText('Bono Reformer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('cobertura')).toHaveText('Solo para Reformer');
    // Y SOLO uno: el bono abierto no lleva aviso, porque sirve para todo.
    await expect(page.getByTestId('cobertura')).toHaveCount(1);
  });

  test('la hoja de compra repite la restricción en la pantalla del pago', async ({ page }) => {
    await montar(page, conBonosAcotados);
    await page.goto(`${base}/comprar`);
    await expect(page.getByText('Bono Reformer')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Comprar' }).first().click();
    await expect(page.getByTestId('cobertura-compra')).toHaveText('Solo para Reformer');
  });

  test('un recibo sin cobrar no se pinta como un cobro en marcha', async ({ page }) => {
    // `PENDIENTE` es una deuda, no un adeudo saliendo del banco. Decirle
    // «te avisaremos» la deja esperando un aviso que nadie va a mandar.
    await montar(page, (f) => {
      (f.socia as Record<string, unknown>).recibos = [{
        id: 'rec-1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', concepto: 'Cuota de septiembre',
        importe: 60, estado: 'PENDIENTE', fechaVencimiento: '2026-09-01', fechaCobro: null,
        metodoCobro: null, suscripcionId: null,
      }];
    });
    await page.goto(`${base}/pagos`);
    await expect(page.getByText('Pendiente')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Procesando')).toHaveCount(0);

    await page.getByText('Cuota de septiembre').click();
    await expect(page.getByText(/todavía está sin cobrar/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/el banco todavía no ha confirmado/i)).toHaveCount(0);
  });

  test('al abrir una hoja el foco entra en ella, y al cerrarla vuelve al botón', async ({ page }) => {
    // Sin esto el foco se quedaba debajo del velo: con teclado, Tab seguía
    // recorriendo la página tapada y no había forma de entrar en el diálogo.
    await montar(page, conBonosAcotados);
    await page.goto(`${base}/comprar`);
    const abrir = page.getByRole('button', { name: 'Comprar' }).first();
    await expect(abrir).toBeVisible({ timeout: 30_000 });
    await abrir.focus();
    await abrir.click();

    const hoja = page.getByRole('dialog');
    await expect(hoja).toBeVisible();
    // El foco está DENTRO del diálogo, no en el botón de debajo.
    await expect.poll(() => hoja.evaluate((d) => d.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    // Y vuelve exactamente a donde estaba, que es lo que espera quien navega
    // sin ratón: no al principio de la página.
    await expect.poll(() => abrir.evaluate((b) => b === document.activeElement)).toBe(true);
  });

  test('los chips de acción de una reserva se pueden tocar con el pulgar', async ({ page }) => {
    // Se pintan a 34 px a propósito (cuatro no caben a 44 en 320 px), pero
    // debajo hay una tarjeta que es un enlace: el toque que se salía llevaba a
    // otra pantalla. La zona sensible crece sin mover lo que se ve.
    // Con `reservas: []` esta pantalla sale vacía y no pinta un solo chip: el
    // test habría medido el botón de volver de la cabecera y pasado sin probar
    // nada de lo que dice probar.
    await montar(page, (f) => {
      (f.socia as Record<string, unknown>).reservas = [{
        id: 'res-1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', sesionId: SESION_ID,
        estado: 'CONFIRMADA', creadoEn: '2026-08-11T10:00:00', spotId: null,
      }];
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/mis-reservas`);
    // Que los chips EXISTAN es parte de lo que se comprueba.
    await expect(page.getByRole('button', { name: /cancelar/i })).toBeVisible({ timeout: 30_000 });

    const alturas = await page.locator('.tap').evaluateAll((els) => els.map((el) => {
      const caja = el.getBoundingClientRect();
      const pseudo = getComputedStyle(el, '::after');
      return { pintado: Math.round(caja.height), tactil: parseFloat(pseudo.height) };
    }));
    // Cuatro chips + el botón de volver de la cabecera, como mínimo.
    expect(alturas.length).toBeGreaterThan(1);
    // Y lo que se PINTA sigue siendo compacto: la corrección no debía engordar
    // la fila, solo la zona sensible.
    expect(Math.min(...alturas.map((a) => a.pintado))).toBeLessThan(44);
    for (const a of alturas) expect(a.tactil).toBeGreaterThanOrEqual(44);
  });
});
