import { test, expect, type Page } from '@playwright/test';
import { abrirCaja, bonoParaLaura, CON_MATRICULA, hoja, json, ventaHecha } from './caja-andamiaje';
import { MENSAJE_CODIGO_YA_USADO } from '../lib/pos/tipos.ts';

// Un código de descuento vale una vez por clienta también en la Caja (decisión del
// fundador, 16-oct-2026). Quien lo sabe es el servidor (`registrar_venta_pos`, con el
// mismo índice que los cobros online): la Caja se entera por la vista previa o por la
// venta (409 CODIGO_YA_USADO_POR_SOCIA), quita el código y lo dice bajo su campo.
//
// ⚠️ Es dinero: cada camino cuenta las peticiones. Que no salga «Cobrado» no prueba
// nada si nadie llegó a intentar cobrar.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 860 } });
test.describe.configure({ timeout: 90_000 });

const CODIGO = {
  id: 'cod-bienvenida', studio_id: 'studio-test', codigo: 'BIENVENIDA', descripcion: null, tipo: 'PORCENTAJE', valor: 10,
  usos: 3, usos_max: null, expira: null, activo: true, creado_en: '2026-09-01T10:00:00Z', min_importe: null, solo_nuevas: false,
};
const YA_USADO = { error: MENSAJE_CODIGO_YA_USADO, codigo: 'CODIGO_YA_USADO_POR_SOCIA' };
// Bono de 130 € con un 10 % (117) y la matrícula de 15 encima, que no se descuenta.
const CON_CODIGO = { total: 132, matricula: 15, matriculaPlanId: 'pl-bono10' };

async function aplicarCodigo(page: Page) {
  await page.getByLabel('Código de descuento').fill('BIENVENIDA');
  await page.getByRole('button', { name: 'Aplicar' }).click();
}

test('si la vista previa dice que esta clienta ya lo usó, el código se quita, se dice por qué y no se intenta cobrar con él', async ({ page }) => {
  const cuenta = await abrirCaja(
    page,
    (r, cuerpo) => cuerpo.codigoDescuentoId ? json(r, YA_USADO, 409) : json(r, CON_MATRICULA),
    (r) => json(r, ventaHecha(145, null)),
    { codigos: [CODIGO] },
  );
  await bonoParaLaura(page);
  await aplicarCodigo(page);

  // El servidor lo ha mirado de verdad, con el código y a nombre de Laura.
  await expect.poll(() => cuenta.presupuestos.filter((p) => p.codigoDescuentoId === 'cod-bienvenida').length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(cuenta.presupuestos.find((p) => p.codigoDescuentoId)).toMatchObject({ socioId: 'soc-2' });

  await expect(page.getByRole('alert').filter({ hasText: 'ya ha usado este código' })).toBeVisible();
  await expect(page.getByLabel('Código de descuento')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quitar', exact: true })).toHaveCount(0);
  // Sin el código, el total vuelve a ser el de verdad, sin descuento.
  await expect(page.getByRole('button', { name: 'Cobrar 145,00 €' })).toBeEnabled({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(0);
});

test('si es la venta la que lo rechaza, no se da por cobrada, se dice por qué y el siguiente intento va sin el código', async ({ page }) => {
  const cuenta = await abrirCaja(
    page,
    (r, cuerpo) => json(r, cuerpo.codigoDescuentoId ? CON_CODIGO : CON_MATRICULA),
    (r, cuerpo, intento) => intento === 1 ? json(r, YA_USADO, 409) : json(r, ventaHecha(Number(cuerpo.totalEsperado), 5)),
    { codigos: [CODIGO] },
  );
  await bonoParaLaura(page);
  await aplicarCodigo(page);
  await page.getByRole('button', { name: 'Cobrar 132,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('140');
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(hoja(page).getByText('No se ha completado el cobro')).toBeVisible({ timeout: 15_000 });
  await expect(hoja(page).getByText(/ya ha usado este código/)).toBeVisible();
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  expect(cuenta.ventas.length).toBeGreaterThan(0);
  expect(cuenta.ventas[0]).toMatchObject({ socioId: 'soc-2', codigoDescuentoId: 'cod-bienvenida', totalEsperado: 132 });

  // Al volver a elegir cómo paga, el total ya es el de sin código, y la venta va sin él.
  await hoja(page).getByRole('button', { name: 'Probar otra vez' }).click();
  await expect(hoja(page).getByTestId('aviso-total-cambiado')).toContainText('145,00 €', { timeout: 15_000 });
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('150');
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(2);
  expect(cuenta.ventas[1]).toMatchObject({ codigoDescuentoId: null, totalEsperado: 145 });
});
