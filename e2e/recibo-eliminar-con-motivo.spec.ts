import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Eliminar un recibo pide un motivo, y solo lo que aún no es dinero cobrado.
//
// Antes «Eliminar» borraba el recibo con un DELETE directo del navegador, en
// cualquier estado y sin decir por qué. Ahora pasa por la RPC `eliminar_recibo`
// con un motivo de una lista cerrada, y el servidor decide si se puede. Aquí se
// prueba la pantalla con la red simulada: NO prueba la RPC (eso se midió contra
// producción con una transacción revertida).
//
// Cada «no debe pasar» lleva su contador de «sí se intentó» (ver
// .claude/tentare-os.md): un test de camino de fallo sin él es hueco.
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Llamadas {
  /** Cuerpos enviados a la RPC. */
  rpc: Array<Record<string, unknown>>;
  /** DELETE directos contra `recibos`: NUNCA debe haber ninguno. */
  deleteDirecto: number;
}

async function montarPanel(page: Page, responder?: (n: number) => { status: number; body?: unknown }): Promise<Llamadas> {
  await montar(page);
  const llamadas: Llamadas = { rpc: [], deleteDirecto: 0 };

  // Playwright resuelve en orden INVERSO al de registro: esto va DESPUÉS de
  // `montar` para que el comodín `**/rest/v1/**` de ahí no lo tape.
  await page.route('**/rest/v1/rpc/eliminar_recibo', route => {
    llamadas.rpc.push(route.request().postDataJSON() as Record<string, unknown>);
    const r = responder ? responder(llamadas.rpc.length) : { status: 204 };
    return r.status === 204 ? route.fulfill({ status: 204 }) : json(route, r.body, r.status);
  });
  await page.route('**/rest/v1/recibos**', route => {
    if (route.request().method() === 'DELETE') {
      llamadas.deleteDirecto += 1;
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
  return llamadas;
}

const fila = (page: Page, id: string) => page.locator(`[data-recibo="${id}"]`);

async function abrirDialogo(page: Page, id: string) {
  const f = fila(page, id);
  await expect(f).toBeVisible({ timeout: 30_000 });
  await f.hover();
  await f.getByTitle('Eliminar').click();
  await expect(page.getByTestId('dialogo-eliminar-recibo')).toBeVisible();
}

test.describe('Cobros · eliminar un recibo', () => {
  test('pide un motivo, elimina por la RPC con él y no borra nunca directo', async ({ page }) => {
    const ll = await montarPanel(page);
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');

    // Sin motivo no se puede confirmar, y dice que se guarda quién y por qué.
    const dialogo = page.getByTestId('dialogo-eliminar-recibo');
    await expect(dialogo).toContainText('Se guarda quién lo elimina, cuándo y por qué');
    await expect(page.getByTestId('confirmar-eliminar-recibo')).toBeDisabled();
    expect(ll.rpc, 'se llamó a la RPC sin motivo').toHaveLength(0);

    await dialogo.getByLabel('Está duplicado').check();
    await expect(page.getByTestId('confirmar-eliminar-recibo')).toBeEnabled();
    await page.getByTestId('confirmar-eliminar-recibo').click();

    await expect(dialogo).toHaveCount(0);
    await expect(fila(page, 'rec-2')).toHaveCount(0);
    expect(ll.rpc, 'la pantalla no llegó a llamar a la RPC').toHaveLength(1);
    expect(ll.rpc[0]).toEqual({ p_studio_id: 'studio-test', p_recibo_id: 'rec-2', p_motivo: 'DUPLICADO' });
    expect(ll.deleteDirecto, 'se borró con un DELETE directo').toBe(0);
    // Solo se quita el eliminado.
    await expect(fila(page, 'rec-4')).toBeVisible();
  });

  test('un recibo FALLIDO también se puede eliminar (aún no es dinero)', async ({ page }) => {
    const ll = await montarPanel(page);
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-4');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Se creó por error').check();
    await page.getByTestId('confirmar-eliminar-recibo').click();
    await expect(fila(page, 'rec-4')).toHaveCount(0);
    expect(ll.rpc).toHaveLength(1);
    expect(ll.rpc[0].p_motivo).toBe('CREADO_POR_ERROR');
  });

  test('un recibo cobrado o con factura no ofrece «Eliminar»: se devuelve', async ({ page }) => {
    const ll = await montarPanel(page);
    await ir(page, 'cobros');
    // Por defecto la lista es «Todo lo que me deben»: para ver los cobrados hay que pedirlos.
    const filtro = page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los recibos' }) });
    await expect(filtro).toBeVisible({ timeout: 30_000 });
    // Cada opción lleva su contador («Todos los recibos (5)»): se elige por lo que dice.
    const etiquetaTodos = await filtro.locator('option', { hasText: 'Todos los recibos' }).first().innerText();
    await filtro.selectOption({ label: etiquetaTodos });

    // La pantalla cargó de verdad y las acciones existen (si no, «no hay botón» pasaría en falso).
    // rec-3 es un cobro sin factura; rec-1, uno con factura.
    for (const id of ['rec-3', 'rec-1']) {
      const f = fila(page, id);
      await expect(f).toBeVisible({ timeout: 30_000 });
      await f.hover();
      await expect(f.getByTitle('Devolver'), `${id} no muestra sus acciones`).toHaveCount(1);
      await expect(f.getByTitle('Eliminar'), `${id} ofrece Eliminar`).toHaveCount(0);
    }
    // Y uno pendiente de esa misma lista sí lo ofrece.
    await fila(page, 'rec-2').hover();
    await expect(fila(page, 'rec-2').getByTitle('Eliminar')).toHaveCount(1);
    expect(ll.rpc).toHaveLength(0);
    expect(ll.deleteDirecto).toBe(0);
  });

  test('si el servidor lo rechaza, el diálogo se queda abierto con el porqué y el recibo sigue', async ({ page }) => {
    const ll = await montarPanel(page, () => ({ status: 400, body: { code: 'P0001', details: null, hint: null, message: 'PAGO_ASOCIADO' } }));
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Está duplicado').check();
    await page.getByTestId('confirmar-eliminar-recibo').click();

    await expect(page.getByTestId('error-eliminar-recibo')).toContainText('pago abierto');
    await expect(page.getByTestId('dialogo-eliminar-recibo')).toBeVisible();
    expect(ll.rpc, 'no llegó a intentarlo').toHaveLength(1);
    expect(ll.deleteDirecto).toBe(0);

    // Cerrar el diálogo no lo elimina, y el recibo sigue en la lista.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(fila(page, 'rec-2')).toBeVisible();
    expect(ll.rpc).toHaveLength(1);
  });

  test('un error técnico del servidor (p. ej. la RPC aún sin desplegar) no se enseña crudo', async ({ page }) => {
    const ll = await montarPanel(page, () => ({
      status: 404,
      body: { code: 'PGRST202', details: null, hint: null, message: 'Could not find the function public.eliminar_recibo(p_motivo, p_recibo_id, p_studio_id) in the schema cache' },
    }));
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Otro motivo').check();
    await page.getByTestId('confirmar-eliminar-recibo').click();

    const error = page.getByTestId('error-eliminar-recibo');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(/schema cache|PGRST|eliminar_recibo/);
    expect(ll.rpc, 'no llegó a intentarlo').toHaveLength(1);
    await expect(fila(page, 'rec-2')).toBeVisible();
  });

  test('un código de la RPC que la pantalla no conoce tampoco se enseña crudo', async ({ page }) => {
    const ll = await montarPanel(page, () => ({ status: 400, body: { code: 'P0001', details: null, hint: null, message: 'CODIGO_NUEVO_DEL_SERVIDOR' } }));
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Está duplicado').check();
    await page.getByTestId('confirmar-eliminar-recibo').click();

    await expect(page.getByTestId('error-eliminar-recibo')).toBeVisible();
    await expect(page.getByTestId('error-eliminar-recibo')).not.toContainText('CODIGO_NUEVO');
    expect(ll.rpc).toHaveLength(1);
    await expect(fila(page, 'rec-2')).toBeVisible();
  });

  test('un recibo que ya no existía se da por eliminado', async ({ page }) => {
    const ll = await montarPanel(page, () => ({ status: 400, body: { code: 'P0001', details: null, hint: null, message: 'RECIBO_NO_ENCONTRADO' } }));
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Está duplicado').check();
    await page.getByTestId('confirmar-eliminar-recibo').click();

    await expect(page.getByTestId('dialogo-eliminar-recibo')).toHaveCount(0);
    await expect(fila(page, 'rec-2')).toHaveCount(0);
    expect(ll.rpc).toHaveLength(1);
  });

  test('cancelar el diálogo no manda nada', async ({ page }) => {
    const ll = await montarPanel(page);
    await ir(page, 'cobros');
    await abrirDialogo(page, 'rec-2');
    await page.getByTestId('dialogo-eliminar-recibo').getByLabel('Está duplicado').check();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByTestId('dialogo-eliminar-recibo')).toHaveCount(0);
    await expect(fila(page, 'rec-2')).toBeVisible();
    expect(ll.rpc).toHaveLength(0);
    expect(ll.deleteDirecto).toBe(0);

    // Y al volver a abrirlo, el motivo no se queda marcado de la vez anterior.
    await abrirDialogo(page, 'rec-2');
    await expect(page.getByTestId('confirmar-eliminar-recibo')).toBeDisabled();
  });
});
