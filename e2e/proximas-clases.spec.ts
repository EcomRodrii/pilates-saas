import { test, expect, type Page } from '@playwright/test';
import { AHORA, montarHome } from './hoy-home-mock.ts';

// «Próximas clases»: qué se está dando AHORA y qué viene después.
//
// Lo que de verdad hay que demostrar aquí es que el cronómetro CORRE. Una
// captura con «30:00» puesto no prueba nada: un número pintado una vez y
// congelado se ve exactamente igual. Por eso el reloj se adelanta a mano y se
// comprueba que el valor ha cambiado — y que la barra de lo que lleva dada
// avanza con él.

const seccion = (page: Page) => page.getByRole('region', { name: 'Próximas clases' });

test.describe('Próximas clases', () => {
  test('la clase en curso sale en vivo y el cronómetro avanza', async ({ page }) => {
    await montarHome(page, { conClaseEnCurso: true });
    const s = seccion(page);
    await expect(s).toBeVisible({ timeout: 30_000 });

    // 11:30–12:30 en hora del estudio, y son las 12:00: media hora dada.
    await expect(s.getByText('En vivo')).toBeVisible();
    await expect(s.getByText('11:30 – 12:30 · Sala Reformer')).toBeVisible();

    // ⚠️ `clock.install` NO congela el tiempo (eso es `setFixedTime`): con él
    // el cronómetro corre de verdad mientras el test carga la página, así que
    // un valor exacto es una carrera perdida. Se para el reloj aquí y a partir
    // de ahora solo avanza lo que se le diga — que es justo lo que hay que
    // demostrar, porque un número pintado una vez y congelado se ve idéntico.
    // Se para DOS MINUTOS por delante del arranque, y no en el arranque:
    // `pauseAt` no sabe ir hacia atrás («Cannot fast-forward to the past») y la
    // página ya ha tardado unos segundos en montar.
    await page.clock.pauseAt(new Date(new Date(AHORA).getTime() + 120_000));
    const crono = s.getByRole('timer');
    // Un tic para que el componente vuelva a pintar con el reloj ya parado.
    await page.clock.fastForward('00:01');
    await expect(crono).toHaveText('32:01');
    await expect(s.getByText('de 60 min · faltan 28')).toBeVisible();

    // 5 de 6, del mismo endpoint y el mismo resumen que la agenda de arriba.
    await expect(s.getByText('/ 6 plazas')).toBeVisible();

    await page.clock.fastForward('00:07');
    await expect(crono).toHaveText('32:08');
    await page.clock.fastForward('01:00');
    await expect(crono).toHaveText('33:08');
    await expect(s.getByText('de 60 min · faltan 27')).toBeVisible();
  });

  test('las siguientes llevan su fecha, su hora y su aforo', async ({ page }) => {
    await montarHome(page, { conClaseEnCurso: true });
    const s = seccion(page);
    await expect(s).toBeVisible({ timeout: 30_000 });

    // Solo DOS, y es a propósito: la agenda de arriba ya tiene el día entero
    // con sus acciones. Aquí van «las siguientes», no la tarde completa — la
    // de las 08:00 ya pasó y la que está en curso tiene su propia tarjeta.
    const tarjetas = s.locator('li');
    await expect(tarjetas).toHaveCount(2);
    await expect(tarjetas.nth(0)).toContainText('14:00');
    await expect(tarjetas.nth(1)).toContainText('17:00');
    await expect(s.getByText('19:30')).toHaveCount(0);

    // 7 de 10 → tres huecos; la de las 17:00 se quedó sin instructora.
    await expect(tarjetas.nth(0)).toContainText('Hoy');
    await expect(tarjetas.nth(0)).toContainText('7/10');
    await expect(tarjetas.nth(0)).toContainText('3 huecos');
    await expect(tarjetas.nth(1)).toContainText('Sin instructora');

    await expect(s.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/calendario');
  });

  test('con el día ya dado, lo siguiente es mañana y lo dice con esa palabra', async ({ page }) => {
    // 21:00 en hora del estudio: han pasado las cuatro clases de hoy. Esta es
    // la razón de ser de la sección —la agenda de arriba se queda en el día de
    // hoy y a esa hora ya no contesta «¿y ahora qué?»—, y el motivo de que
    // cada tarjeta lleve su fecha.
    await montarHome(page, { conClaseEnCurso: true, ahora: '2026-09-08T19:00:00.000Z' });
    const s = seccion(page);
    await expect(s).toBeVisible({ timeout: 30_000 });

    await expect(s.getByText('En vivo')).toHaveCount(0);
    const tarjetas = s.locator('li');
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjetas.nth(0)).toContainText('Mañana');
    await expect(tarjetas.nth(0)).toContainText('10:00');
  });

  test('sin clase en curso no se inventa ninguna en vivo', async ({ page }) => {
    await montarHome(page);
    const s = seccion(page);
    await expect(s).toBeVisible({ timeout: 30_000 });
    await expect(s.getByText('En vivo')).toHaveCount(0);
    await expect(s.getByRole('timer')).toHaveCount(0);
    await expect(s.locator('li')).toHaveCount(2);
  });

  test('sin clases a la vista la sección no ocupa sitio', async ({ page }) => {
    await montarHome(page, { calendarioVacio: true });
    // La agenda de arriba ya dice que el día está tranquilo: repetirlo aquí
    // sería una caja vacía debajo de otra.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(seccion(page)).toHaveCount(0);
  });
});
