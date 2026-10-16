import { test, expect } from '@playwright/test';
import { abrirCaja, bonoParaLaura, CON_MATRICULA, hoja, json, ventaHecha } from './caja-andamiaje';
import { mensajeTotalNoCoincide } from '../lib/pos/total-esperado.ts';

// La Caja cobra el total que enseña, matrícula incluida.
//
// `registrar_venta_pos` añade por su cuenta la matrícula del primer plan de una
// clienta. La hoja de cobro enseñaba el total sin ella: con tarjeta, «Sí, he
// cobrado 130 €» quedaba registrado como 145 €; en efectivo, «Cambio 20» y
// después «Devuelve 5». Ahora el total sale de la misma RPC
// (`/api/pos/venta/presupuesto`), la venta manda el que se ha visto
// (`totalEsperado`) y el servidor la rechaza si no es el suyo (409
// IMPORTE_NO_COINCIDE). Con el TPV del banco o una transferencia el dinero se
// mueve FUERA de Tentare antes de confirmar: sin el total comprobado, esos dos
// métodos no se ofrecen, y tras un rechazo se dice cuánto falta, no «el total».
//
// ⚠️ Es dinero: cada camino cuenta las peticiones. Un «no dijo Cobrado» sin
// contador puede ser verdad por no haber intentado nada.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 860 } });
// La primera visita a /pos compila la ruta en el `next dev`.
test.describe.configure({ timeout: 90_000 });

test('con clienta y su primer plan, el ticket y la hoja de cobro llevan la matrícula, y con tarjeta se afirma y se manda ese total', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r) => json(r, CON_MATRICULA), (r) => json(r, ventaHecha(145, null)));
  await bonoParaLaura(page);

  const linea = page.getByTestId('linea-matricula');
  await expect(linea).toContainText('Matrícula — Bono 10 clases');
  await expect(linea).toContainText('15,00 €');
  await page.getByRole('button', { name: 'Cobrar 145,00 €' }).click();

  await expect(hoja(page).getByText('145,00 €', { exact: true }).first()).toBeVisible();
  await expect(hoja(page).getByTestId('cobro-matricula')).toHaveText('Incluye Matrícula — Bono 10 clases · 15,00 €');
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 145,00 €' }).click();
  await expect(page.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.presupuestos.length).toBeGreaterThan(0);
  expect(cuenta.presupuestos.at(-1)).toMatchObject({ socioId: 'soc-2' });
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ metodoPago: 'TARJETA', socioId: 'soc-2', totalEsperado: 145 });

  // La venta siguiente, con la misma clienta y el mismo plan, vuelve a preguntar: la
  // cuenta de antes no vale (el cupo de matrícula, por ejemplo, puede haber cambiado).
  const antes = cuenta.presupuestos.length;
  await hoja(page).getByRole('button', { name: 'Nueva venta' }).click();
  await bonoParaLaura(page);
  await expect(page.getByRole('button', { name: 'Cobrar 145,00 €' })).toBeEnabled({ timeout: 15_000 });
  expect(cuenta.presupuestos.length).toBeGreaterThan(antes);
});

test('en efectivo, el cambio se calcula sobre el total con matrícula', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r) => json(r, CON_MATRICULA), (r) => json(r, ventaHecha(145, 5)));
  await bonoParaLaura(page);
  await page.getByRole('button', { name: 'Cobrar 145,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();

  // Con 140 € no llega (antes, contra 130, daba «Cambio 10»).
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('140');
  await expect(hoja(page).getByText('Falta')).toBeVisible();
  await expect(hoja(page).getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('150');
  await expect(hoja(page).getByText('Cambio')).toBeVisible();
  await expect(hoja(page).getByText('5,00 €', { exact: true })).toBeVisible();
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ metodoPago: 'EFECTIVO', efectivoRecibido: 150, totalEsperado: 145 });
});

test('sin el total comprobado no deja cobrar con el TPV del banco ni por transferencia, hasta volver a comprobarlo', async ({ page }) => {
  let caida = true;
  const cuenta = await abrirCaja(
    page,
    (r) => caida ? json(r, { error: 'No hemos podido calcular el total.' }, 500) : json(r, CON_MATRICULA),
    (r) => json(r, ventaHecha(145, null)),
  );
  await bonoParaLaura(page);
  await expect(page.getByText(/Al cobrar se vuelve a comprobar el total/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Cobrar 130,00 €' }).click();

  await expect(hoja(page).getByTestId('aviso-total-sin-comprobar')).toBeVisible();
  await expect(hoja(page).getByRole('button', { name: /^Tarjeta/ })).toBeDisabled();
  await expect(hoja(page).getByRole('button', { name: /^Transferencia/ })).toBeDisabled();
  const fallidas = cuenta.presupuestos.length;
  expect(fallidas).toBeGreaterThan(0);

  caida = false;
  await hoja(page).getByRole('button', { name: 'Volver a comprobar' }).click();
  // Cambia con la hoja abierta: lo dice, en vez de cambiar la cifra sin más.
  await expect(hoja(page).getByTestId('aviso-total-cambiado')).toContainText('ahora son 145,00 €');
  await expect(hoja(page).getByTestId('cobro-matricula')).toHaveText('Incluye Matrícula — Bono 10 clases · 15,00 €');
  expect(cuenta.presupuestos.length).toBeGreaterThan(fallidas);
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 145,00 €' }).click();
  await expect(page.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ metodoPago: 'TARJETA', totalEsperado: 145 });
});

test('si el servidor dice que el total no es ese, no lo da por registrado, dice cuánto falta y el siguiente intento manda el bueno', async ({ page }) => {
  // La vista previa dijo 130 (sin matrícula: un cupo gratis que alguien se lleva justo
  // después); la venta, 145. Con el TPV del banco quien cobra quizá ya pasó 130.
  const rechazo = { esperado: 130, total: 145, matricula: 15 };
  const cuenta = await abrirCaja(
    page,
    (r) => json(r, { total: 130, matricula: 0, matriculaPlanId: null }),
    (r, _c, intento) => intento === 1
      ? json(r, { error: mensajeTotalNoCoincide(rechazo, 'TARJETA'), codigo: 'IMPORTE_NO_COINCIDE', ...CON_MATRICULA }, 409)
      : json(r, ventaHecha(145, null)),
  );
  await bonoParaLaura(page);
  await page.getByRole('button', { name: 'Cobrar 130,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 130,00 €' }).click();

  await expect(hoja(page).getByText('El total ha cambiado', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(hoja(page).getByText(/El total de esta venta es 145,00 €/)).toBeVisible();
  await expect(hoja(page).getByText(/cobra solo los 15,00 € que faltan/)).toBeVisible();
  // Nunca «no se ha cobrado nada»: con el TPV del banco quizá sí.
  await expect(hoja(page).getByText(/ni cobrado nada/)).toHaveCount(0);
  await expect(page.getByText('Registrado', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  // Se intentó de verdad, y con el total que se veía.
  expect(cuenta.ventas.length).toBeGreaterThan(0);
  expect(cuenta.ventas[0]).toMatchObject({ totalEsperado: 130 });

  await hoja(page).getByRole('button', { name: 'Seguir con el total nuevo' }).click();
  await expect(hoja(page).getByTestId('cobro-matricula')).toHaveText('Incluye Matrícula — Bono 10 clases · 15,00 €');
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 145,00 €' }).click();
  await expect(page.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(2);
  expect(cuenta.ventas[1]).toMatchObject({ totalEsperado: 145 });
});

test('sin clienta ni descuento no se pregunta, y la venta manda el total del ticket; con un descuento, sí se pregunta', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r, cuerpo) => json(r, { total: cuerpo.descuentoTipo ? 117 : 130, matricula: 0, matriculaPlanId: null }), (r) => json(r, ventaHecha(130, 0)));
  await page.getByRole('button', { name: /^Bono 10 clases/ }).click();
  await page.getByRole('button', { name: 'Cobrar 130,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('130');
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.presupuestos).toHaveLength(0);
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ socioId: null, totalEsperado: 130 });

  // Un descuento se redondea aquí con otra función que en la base de datos: el total lo cuenta el servidor.
  await hoja(page).getByRole('button', { name: 'Nueva venta' }).click();
  await page.getByRole('button', { name: /^Bono 10 clases/ }).click();
  await page.getByRole('button', { name: 'Descuento en porcentaje' }).click();
  await page.getByLabel('Descuento', { exact: true }).fill('10');
  await expect(page.getByRole('button', { name: 'Cobrar 117,00 €' })).toBeEnabled({ timeout: 15_000 });
  expect(cuenta.presupuestos.length).toBeGreaterThan(0);
  expect(cuenta.presupuestos.at(-1)).toMatchObject({ descuentoTipo: 'PORCENTAJE', descuentoValor: 10 });
});
