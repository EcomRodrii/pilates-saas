import { test, expect } from '@playwright/test';
import { abrirCaja, hoja, json, ventaHecha } from './caja-andamiaje';

// Un ticket a 0 € (todo descontado) no pasa por el proveedor: el servidor lo confirma
// y lo entrega. Si esa confirmación no sale, el servidor ya no dice PAGADA
// (`lib/pos/ticket-a-cero.ts`): contesta 503 con el intento cerrado. La Caja tiene que
// decir que no se completó, sin «Cobrado», y el siguiente intento ser una venta nueva.
//
// ⚠️ Es un camino de fallo: se cuentan las ventas. Que no salga «Cobrado» no prueba
// nada si nadie llegó a intentar registrarla.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 860 } });
test.describe.configure({ timeout: 90_000 });

const REGALO = {
  id: 'cod-regalo', studio_id: 'studio-test', codigo: 'REGALO', descripcion: null, tipo: 'PORCENTAJE', valor: 100,
  usos: 0, usos_max: null, expira: null, activo: true, creado_en: '2026-09-01T10:00:00Z', min_importe: null, solo_nuevas: false,
};
const NO_CONFIRMADA = {
  error: 'No se ha podido registrar la venta. No se ha cobrado nada: vuelve a intentarlo.',
  codigo: 'INTENTO_CERRADO',
};

test('si el ticket a 0 € no se puede confirmar, no dice «Cobrado» y el siguiente intento es una venta nueva', async ({ page }) => {
  const cuenta = await abrirCaja(
    page,
    (r, cuerpo) => json(r, cuerpo.codigoDescuentoId ? { total: 0, matricula: 0, matriculaPlanId: null } : { total: 12, matricula: 0, matriculaPlanId: null }),
    (r, _cuerpo, intento) => intento === 1 ? json(r, NO_CONFIRMADA, 503) : json(r, ventaHecha(0, null)),
    { codigos: [REGALO] },
  );
  await page.getByRole('button', { name: /^Calcetines antideslizantes/ }).click();
  await page.getByLabel('Código de descuento').fill('REGALO');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await page.getByRole('button', { name: 'Cobrar 0,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Bizum/ }).click();

  await expect(hoja(page).getByText('No se ha completado el cobro')).toBeVisible({ timeout: 15_000 });
  await expect(hoja(page).getByText(/No se ha cobrado nada/)).toBeVisible();
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ codigoDescuentoId: 'cod-regalo', totalEsperado: 0 });

  // El intento quedó cerrado: «Probar otra vez» manda otra venta, con otra clave.
  await hoja(page).getByRole('button', { name: 'Probar otra vez' }).click();
  await hoja(page).getByRole('button', { name: /^Bizum/ }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(2);
  expect(cuenta.ventas[1].idempotenciaClave).not.toBe(cuenta.ventas[0].idempotenciaClave);
});
