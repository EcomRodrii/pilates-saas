import { test, expect } from '@playwright/test';
import { SLUG, SESION_ID, sembrarSociaCompleta } from './socia-completa';

// El andamiaje probándose a sí mismo.
//
// ⚠️ Existe por un fallo real de `socia-completa.ts`: las rutas de PREFIJO
// (`/api/public/comunidad/`) estaban registradas DESPUÉS de las exactas
// (`/api/public/comunidad/posts`), y en Playwright gana la última — así que el
// prefijo se comía a la exacta y las opciones `posts` y `conversaciones` no
// hacían NADA. Se sembraban tres publicaciones y la pantalla salía con «Aún no
// hay publicaciones»… con su ilustración de estado vacío y todo.
//
// Un andamiaje que se traga en silencio lo que le pides es PEOR que no tenerlo:
// lo que enseña parece un hallazgo del producto. Este fichero comprueba que
// cada opción llega hasta la pantalla.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · el andamiaje hace lo que dice', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('`posts` llega al tablón', async ({ page }) => {
    const and = await sembrarSociaCompleta(page, { posts: 3 });
    await page.goto(`${base}/comunidad`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Publicación 1 del estudio.')).toBeVisible({ timeout: 30_000 });
    const texto = await page.locator('body').innerText();
    expect(texto, 'se sembraron 3 publicaciones y sale el estado vacío').not.toContain('Aún no hay publicaciones');
    expect([...new Set(and.sinMockear())]).toEqual([]);
  });

  test('`conversaciones` llega a mensajes', async ({ page }) => {
    const and = await sembrarSociaCompleta(page, { conversaciones: 2 });
    await page.goto(`${base}/mensajes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const texto = await page.locator('body').innerText();
    expect(texto, 'se sembraron 2 conversaciones y sale el estado vacío').not.toContain('Aún no tienes conversaciones');
    expect([...new Set(and.sinMockear())]).toEqual([]);
  });

  test('`bono` y `recibos` llegan a sus pantallas', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 3, recibos: 2 });
    await page.goto(`${base}/bonos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Te quedan 3 de 8')).toBeVisible({ timeout: 30_000 });
    await page.goto(`${base}/pagos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Bono 8 sesiones')).toBeVisible({ timeout: 30_000 });
  });

  test('`reservada` y `ocupadas` cuadran el aforo', async ({ page }) => {
    // 6 de otras + la suya = 7 de 10 → quedan 3.
    await sembrarSociaCompleta(page, { reservada: true, ocupadas: 6 });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('10 personas · 3 libres')).toBeVisible({ timeout: 30_000 });
  });

  test('`avisos` llegan a la bandeja con su cara', async ({ page }) => {
    await sembrarSociaCompleta(page, { avisos: [
      { id: 'n1', title: 'Tu reserva se ha cancelado', body: 'La clase de hoy', category: 'reservas', eventType: 'reserva.cancelada' },
    ] });
    await page.goto(`${base}/notificaciones`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Tu reserva se ha cancelado')).toBeVisible({ timeout: 30_000 });
    expect(await page.locator('body').innerText()).not.toContain('Todo al día');
  });
});
