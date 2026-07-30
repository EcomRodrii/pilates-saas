import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// AVISOS — pantalla del prototipo. Lo que se comprueba aquí no es el pixel
// (para eso están las capturas), sino lo que la pantalla PROMETE: que el
// subtítulo cuenta lo que de verdad hay sin leer, que los leídos se distinguen
// de los nuevos, y que una bandeja vacía no se queda en blanco.

test.describe('Avisos', () => {
  test('el subtítulo cuenta lo nuevo y la lista trae los cuatro avisos', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible();
    // Dos sin leer en el mock → el subtítulo va en letra, no en cifra.
    await expect(page.getByText('Dos cosas nuevas.')).toBeVisible();

    await expect(page.getByText('Tu clase de hoy sigue en pie')).toBeVisible();
    await expect(page.getByText('María Soler cubre el viernes')).toBeVisible();
    await expect(page.getByText('Te quedan 8 sesiones')).toBeVisible();
    await expect(page.getByText('Nuevo taller el 12 de agosto')).toBeVisible();
  });

  test('el sello temporal se escribe en palabras, no en fecha ISO', async ({ page }) => {
    // Reloj congelado a mediodía UTC, lejos de cualquier medianoche: sin esto,
    // "hace 2 h" se calculaba contra la hora REAL de ejecución, y entre las
    // 00:00 y las ~02:00 (hora del runner) esas 2 horas atrás caían en el DÍA
    // DE AYER — selloTemporal() corta por día natural, no por horas — y la
    // pantalla decía "ayer" en vez de "hace 2 h". Mismo instante en el reloj
    // del navegador y en el mock (montarPortal `ahora`), para que los dos
    // lados calculen "hace N h" contra el mismo punto de referencia.
    const ahora = new Date('2026-07-15T12:00:00Z');
    await page.clock.setFixedTime(ahora);
    await montarPortal(page, { conSesion: true, ahora });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    // En el DOM va en minúscula; las versalitas son CSS. Se comprueban las dos
    // mitades, porque `getByText('HACE 2 H')` no encuentra nada aunque en
    // pantalla ponga exactamente eso.
    const sello = page.getByText('hace 2 h', { exact: true });
    await expect(sello).toBeVisible();
    await expect(sello).toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByText('ayer', { exact: true })).toBeVisible();
  });

  test('lo ya leído se apaga y pierde el punto', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    const nuevo = page.getByText('Tu clase de hoy sigue en pie').locator('..');
    const leido = page.getByText('Te quedan 8 sesiones').locator('..');

    await expect(nuevo).toHaveCSS('opacity', '1');
    // 0.81 exacto: el titular queda en el mismo gris que el diseño.
    await expect(leido).toHaveCSS('opacity', '0.81');
  });

  test('una bandeja vacía dice qué va a aparecer ahí', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinAvisos: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    await expect(page.getByText('Nada nuevo.')).toBeVisible();
    await expect(page.getByText(/Aquí aparecerán tus reservas/)).toBeVisible();
  });

  test('la flecha vuelve a Inicio', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    // Esperar a que la lista esté pintada no es adorno: ese texto solo aparece
    // cuando el efecto de carga ya corrió, y por tanto cuando React ya enganchó
    // el onClick. Sin esto, con la máquina cargada el clic llega antes de la
    // hidratación y no pasa nada.
    await expect(page.getByText('Dos cosas nuevas.')).toBeVisible();

    await page.getByRole('button', { name: 'Volver a Inicio' }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home$`));
  });
});
