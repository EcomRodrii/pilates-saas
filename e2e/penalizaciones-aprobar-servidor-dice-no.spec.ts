import { test, expect, type Page, type Route } from '@playwright/test';
import { montar } from './panel-sembrado';
import {
  cuerpoRespuesta, decidirAntesDeCobrar, planificarTrasCobro, type Desenlace,
} from '../lib/billing/penalizacion-aprobar-reglas';

// ─────────────────────────────────────────────────────────────────────────────
// «Aprobar y cobrar» una penalización desde la bandeja de Inicio, cuando el
// servidor NO dice que sí (components/dashboard/penalizaciones-pendientes.tsx).
//
// Lo que se fija:
//   · sin respuesta o con un 5xx la fila se queda, el botón vuelve y se dice
//     que reintentar es seguro — antes una red caída o un 504 con HTML dejaban
//     el botón en «Cobrando…» para siempre;
//   · 402/409 son terminales: la fila se va sin anunciar «Cobro aprobado»;
//   · dos toques en el mismo tick salen como UN solo POST;
//   · 202 y «ya estaba cobrada» dicen lo que ha pasado de verdad.
//
// ⚠️ Cada caso de fallo cuenta los POST: «no mintió» puede ser cierto por no
// haber llegado a pedir nada.
// ─────────────────────────────────────────────────────────────────────────────

const PENALIZACION = { id: 'pen-1', socio_id: 'soc-1', importe: 12, tipo: 'NO_SHOW', detectada_en: '2026-09-10T09:00:00Z' };
const SIN_CONFIRMAR = 'No hemos podido confirmar el cobro. Puedes reintentar: si ya entró, no se cobra dos veces.';

type Respuesta =
  | { status: number; body: unknown }
  | { status: number; html: string }
  | 'abortar';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function montarConPenalizacion(page: Page, respuesta: Respuesta, retener?: Promise<void>) {
  await montar(page);
  const intentos = { post: 0, cuerpo: null as unknown };
  // Después del andamiaje: la última ruta registrada gana.
  await page.route('**/rest/v1/penalizaciones**', r => json(r, [PENALIZACION]));
  await page.route('**/api/penalizaciones/aprobar**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    intentos.post++;
    intentos.cuerpo = JSON.parse(route.request().postData() || 'null');
    if (retener) await retener;
    if (respuesta === 'abortar') return route.abort('failed');
    if ('html' in respuesta) {
      return route.fulfill({ status: respuesta.status, contentType: 'text/html', body: respuesta.html });
    }
    return json(route, respuesta.body, respuesta.status);
  });
  await page.goto('/dashboard');

  const tarjeta = page.locator('#decidir-penalizaciones');
  await expect(tarjeta.getByText('María García Fernández')).toBeVisible({ timeout: 30_000 });
  const boton = tarjeta.getByRole('button', { name: /Aprobar y cobrar/ });
  return { intentos, tarjeta, boton };
}

test.describe('Aprobar una penalización cuando el servidor no dice que sí', () => {
  test('el botón lleva el importe', async ({ page }) => {
    const { boton, intentos } = await montarConPenalizacion(page, { status: 200, body: { ok: true, resultado: 'COBRADA' } });
    await expect(boton).toHaveText(/^Aprobar y cobrar 12,00\s€$/);
    expect(intentos.post).toBe(0);
  });

  for (const [nombre, respuesta] of [
    ['503', { status: 503, body: { error: 'Stripe no respondió y el cobro quedó sin confirmar. Se reintentará solo con la misma clave, sin riesgo de doble cargo.' } }],
    ['504 con cuerpo HTML', { status: 504, html: '<html><body>Gateway Timeout</body></html>' }],
    ['red caída', 'abortar'],
  ] as const) {
    test(`${nombre}: la fila se queda, el botón vuelve y dice que reintentar es seguro`, async ({ page }) => {
      const { intentos, tarjeta, boton } = await montarConPenalizacion(page, respuesta);
      await boton.click();

      await expect.poll(() => intentos.post).toBeGreaterThan(0);
      await expect(tarjeta.getByText(SIN_CONFIRMAR)).toBeVisible({ timeout: 15_000 });
      await expect(boton).toBeEnabled();
      await expect(boton).not.toHaveText('Cobrando…');
      await expect(tarjeta.getByText('María García Fernández')).toBeVisible();
      // El 503 promete un reintento automático que en el camino manual no existe.
      await expect(page.getByText(/Se reintentará solo/)).toHaveCount(0);
      await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
      expect(intentos.cuerpo).toEqual({ penalizacionId: 'pen-1' });
    });
  }

  test('402: la fila se va y no se anuncia «Cobro aprobado»', async ({ page }) => {
    const { intentos, tarjeta } = await montarConPenalizacion(page, {
      status: 402, body: { error: 'No se ha podido cobrar con la tarjeta guardada. La penalización queda como no cobrada.' },
    });
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('No se ha podido cobrar con la tarjeta guardada')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });

  test('409: la fila se va y lo dice sin hablar de cobro aprobado', async ({ page }) => {
    const { intentos, tarjeta } = await montarConPenalizacion(page, {
      status: 409, body: { error: 'Esta penalización ya no está pendiente de aprobación.' },
    });
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Esta penalización ya no está pendiente de aprobación.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });

  test('doble toque en el mismo instante: un solo POST', async ({ page }) => {
    let soltar!: () => void;
    const retenido = new Promise<void>((r) => { soltar = r; });
    const { intentos, boton } = await montarConPenalizacion(page, { status: 200, body: { ok: true, resultado: 'COBRADA' } }, retenido);

    // Dos clics en el mismo tick: el estado de React aún no ha deshabilitado el
    // botón cuando llega el segundo.
    await boton.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect.poll(() => intentos.post).toBe(1);
    await expect(page.locator('#decidir-penalizaciones').getByRole('button', { name: 'Cobrando…' })).toBeDisabled();

    soltar();
    await expect(page.getByText('Cobro aprobado')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    expect(intentos.post).toBe(1);
  });

  test('202: cobrado sin registrar, lo dice así y la fila se va', async ({ page }) => {
    const { intentos, tarjeta } = await montarConPenalizacion(page, {
      status: 202, body: { ok: true, aviso: 'COBRADO_SIN_PERSISTIR', error: 'Cobro completado en Stripe, pendiente de reconciliación manual.' },
    });
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Cobro completado en Stripe, pendiente de reconciliación manual.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });

  test('200 «ya estaba cobrada»: la fila se va sin decir que se ha cobrado ahora', async ({ page }) => {
    const { intentos, tarjeta } = await montarConPenalizacion(page, { status: 200, body: { ok: true, resultado: 'YA_COBRADA' } });
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Esta penalización ya estaba cobrada: no se ha vuelto a cobrar.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBe(1);
  });

  // ── Respuestas construidas con las MISMAS reglas que usa la ruta ──────────
  // Así el mock no puede divergir del cuerpo que el servidor manda de verdad.
  const delServidor = (d: Desenlace) => ({ status: d.http, body: cuerpoRespuesta(d) });

  test('Stripe no está listo: la fila se queda, dice qué revisar y se puede volver a aprobar', async ({ page }) => {
    const d = planificarTrasCobro({ ok: false, errorCode: 'SIN_STRIPE_CONECTADO', error: 'El estudio no tiene Stripe conectado' }).desenlace;
    const { intentos, tarjeta, boton } = await montarConPenalizacion(page, delServidor(d));
    await boton.click();

    await expect.poll(() => intentos.post).toBeGreaterThan(0);
    await expect(tarjeta.getByText(/No se ha cobrado: este estudio no tiene Stripe conectado/)).toBeVisible({ timeout: 15_000 });
    await expect(tarjeta.getByText(/Configuración → Integraciones/)).toBeVisible();
    await expect(tarjeta.getByText(SIN_CONFIRMAR)).toHaveCount(0);
    await expect(boton).toBeEnabled();
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);

    // Sigue pendiente de verdad: se puede volver a pulsar y sale otro POST.
    const antes = intentos.post;
    await boton.click();
    await expect.poll(() => intentos.post).toBe(antes + 1);
    await expect(tarjeta.getByText('María García Fernández')).toBeVisible();
  });

  test('una FALLIDA con el recibo ya cobrado se cierra como «ya estaba cobrada»', async ({ page }) => {
    const plan = decidirAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-penaliz-pen-1' }, { ok: true, estado: 'COBRADO' });
    if (!plan) throw new Error('las reglas deberían contestar sin cobrar');
    const { intentos, tarjeta } = await montarConPenalizacion(page, delServidor(plan.desenlace));
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Esta penalización ya estaba cobrada: no se ha vuelto a cobrar.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });

  test('una FALLIDA con el recibo sin cobrar sigue siendo 409: la fila se va sin «Cobro aprobado»', async ({ page }) => {
    const plan = decidirAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-penaliz-pen-1' }, { ok: true, estado: 'FALLIDO' });
    if (!plan) throw new Error('las reglas deberían contestar sin cobrar');
    const { intentos, tarjeta } = await montarConPenalizacion(page, delServidor(plan.desenlace));
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Esta penalización ya no está pendiente de aprobación.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText('Cobro aprobado')).toHaveCount(0);
    expect(intentos.post).toBeGreaterThan(0);
  });

  test('cobrado pero lo de después falló: dice «Cobrado» y que se revise el recibo, no «no se ha vuelto a cobrar»', async ({ page }) => {
    const d = planificarTrasCobro({ ok: false, errorCode: 'ERROR_TRANSITORIO' }, { ok: true, estado: 'COBRADO' }).desenlace;
    const { intentos, tarjeta } = await montarConPenalizacion(page, delServidor(d));
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Cobrado. No hemos podido completar el resto: revisa el recibo en Cobros.')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    await expect(page.getByText(/no se ha vuelto a cobrar/)).toHaveCount(0);
    expect(intentos.post).toBe(1);
  });

  test('200: cobro aprobado y la fila se va', async ({ page }) => {
    const { intentos, tarjeta } = await montarConPenalizacion(page, { status: 200, body: { ok: true, resultado: 'COBRADA', status: 'succeeded' } });
    await tarjeta.getByRole('button', { name: /Aprobar y cobrar/ }).click();

    await expect(page.getByText('Cobro aprobado')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#decidir-penalizaciones')).toHaveCount(0);
    expect(intentos.post).toBe(1);
    expect(intentos.cuerpo).toEqual({ penalizacionId: 'pen-1' });
  });
});
