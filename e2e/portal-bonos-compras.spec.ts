import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// `/mi-plan` era una sola ruta con tres trabajos: mirar el saldo, comprar y
// consultar facturas. El diseño lo parte en dos pantallas, y el corte trae
// consigo tres cosas que hay que fijar aquí:
//
//  1. `/mi-plan` NO puede morir: hay 24 avisos en producción con ese deep link
//     guardado en su fila, más el retorno de Stripe tras domiciliar.
//  2. La barra de saldo tiene que contar la verdad — es un bono pagado.
//  3. «EL MÁS ELEGIDO» viene del servidor. Calculado en el navegador, en el
//     portal solo hay las suscripciones de quien mira: su propia compra.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Bonos', () => {
  test('la tarjeta dice el saldo real y la barra lo acompaña', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });

    // El bono del mock está acotado a Reformer: el nombre lo dice.
    await expect(page.getByText('Bono 10 · Reformer')).toBeVisible();
    await expect(page.getByText('de 10 sesiones disponibles')).toBeVisible();
    await expect(page.getByText('Caduca el 30 de septiembre')).toBeVisible();
  });

  test('la plaza fija se lee en día y hora', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByText('Miércoles · 18:30')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reformer Flow · Sala Norte')).toBeVisible();
  });

  test('sin bono la pantalla no se queda muda', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinBono: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    await expect(page.getByText('Todavía no tienes bono')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Ver los bonos' })).toBeVisible();
  });

  test('«Renovar bono» lleva a Compras', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/bonos`);
    // Esperar a que el saldo esté pintado no es adorno: ese texto solo aparece
    // cuando los datos ya llegaron, y por tanto cuando React ya enganchó el
    // onClick. Sin esto, con la máquina cargada el clic se pierde en silencio
    // y el test falla en grupo aunque pase suelto — ya pasó en Avisos.
    await expect(page.getByText('de 10 sesiones disponibles')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Renovar bono' }).click();
    // Timeout explícito: con `next dev`, la primera navegación a /compras
    // compila la ruta bajo demanda y se pasa de los 5s por defecto.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/compras$`), { timeout: 30_000 });
  });
});

test.describe('Portal — Compras', () => {
  test('el catálogo enseña los planes y deja fuera la clase suelta', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: /Bono 10/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bono 5/ })).toBeVisible();
    // Un mensual dice que es mensual, al lado de su precio.
    await expect(page.getByText('129 €/mes')).toBeVisible();
    // La clase suelta se compra al reservar, no aquí.
    await expect(page.getByRole('button', { name: /Clase suelta/ })).toHaveCount(0);
    // 175/10: el precio unitario se dice UNA vez. `precioPorClase` ya trae el
    // sufijo, y añadírselo daba «17,50 € por clase por clase».
    await expect(page.getByText('17,50 € por clase', { exact: true })).toBeVisible();
  });

  test('«EL MÁS ELEGIDO» NO sale si el servidor no lo manda', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('El más elegido')).toHaveCount(0);
  });

  test('«EL MÁS ELEGIDO» se pinta cuando el servidor manda el ganador', async ({ page }) => {
    await montarPortal(page, { conSesion: true, planMasElegidoId: 'plan-b10' });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByText('El más elegido')).toBeVisible({ timeout: 30_000 });
  });

  test('un recibo cobrado ofrece su PDF y uno pendiente ofrece pagarlo', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('button', { name: /Descargar la factura/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pagar', exact: true })).toBeVisible();
    await expect(page.getByText('Pendiente')).toBeVisible();
  });

  test('la flecha vuelve a Bonos, no a Inicio', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    await expect(page.getByRole('heading', { name: 'Compras' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Volver a Bonos' }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/bonos$`), { timeout: 30_000 });
  });
});

test.describe('El corte de /mi-plan', () => {
  test('/mi-plan sigue viva y lleva a Bonos', async ({ page }) => {
    // 24 avisos en producción llevan este deep link guardado en su fila.
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/mi-plan`);
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/bonos$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible();
  });

  test('el menú marca Bonos también estando en Compras', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/compras`);
    const bonos = page.getByRole('link', { name: 'Bonos' });
    await expect(bonos).toBeVisible({ timeout: 30_000 });
    // `aria-current` es lo que dice «estás aquí» a un lector de pantalla; el
    // prototipo marcaba Inicio, que es decirle que está donde no está.
    await expect(bonos).toHaveAttribute('aria-current', 'page');
  });
});
