import { test, expect, type Page } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// AVISOS — pantalla del prototipo. Lo que se comprueba aquí no es el pixel
// (para eso están las capturas), sino lo que la pantalla PROMETE: que el
// subtítulo cuenta lo que de verdad hay sin leer, que los leídos se distinguen
// de los nuevos, y que una bandeja vacía no se queda en blanco.
//
// selloTemporal() mide "hace 2 h" contra la hora REAL del navegador en el
// instante de pintar, no contra un reloj de mentira — así que si generamos
// "hace 2 h" con el Date.now() del proceso de Node al cargar el módulo
// (portal-mock.ts), en la ventana peligrosa de la CI (las 2 primeras horas
// tras medianoche UTC) esas "2 horas antes" caen en el día anterior de
// verdad, y la pantalla — correctamente — deja de decir "hace 2 h" para
// decir "ayer". No es un bug de selloTemporal, es que el fixture asumía que
// esa resta nunca cruzaba el corte de día. Se fija el reloj del navegador
// (solo Date, los timers siguen corriendo de verdad) a un mediodía UTC y se
// generan los avisos contra ESE MISMO instante, para que mock y pantalla
// midan "ahora" de forma idéntica pase lo que pase con la hora real de la
// máquina que ejecuta la CI.
function mediodiaSeguro(): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

async function conAvisosDeterministas(page: Page) {
  const ahora = mediodiaSeguro();
  await page.clock.setFixedTime(ahora);
  const haceHoras = (h: number) => new Date(ahora.getTime() - h * 3600_000).toISOString();
  const items = [
    { id: 'n-1', title: 'Tu clase de hoy sigue en pie', body: 'Reformer Flow, 18:30 con Ana Ferrer. Te esperamos en la Sala Norte.',
      deepLink: null, category: 'clases', priority: 'ALTA', eventType: 'clase.sustituida',
      resourceType: null, resourceId: null, readAt: null, createdAt: haceHoras(2) },
    { id: 'n-2', title: 'María Soler cubre el viernes', body: 'Tu Barre Sculpt del 31 de julio mantiene hora y sala.',
      deepLink: null, category: 'clases', priority: 'NORMAL', eventType: 'clase.sustituida',
      resourceType: null, resourceId: null, readAt: null, createdAt: haceHoras(26) },
    { id: 'n-3', title: 'Te quedan 8 sesiones', body: 'Tu Bono 10 caduca el 30 de septiembre.',
      deepLink: null, category: 'pagos', priority: 'NORMAL', eventType: 'bono.por_agotarse',
      resourceType: null, resourceId: null, readAt: haceHoras(40), createdAt: haceHoras(50) },
    { id: 'n-4', title: 'Nuevo taller el 12 de agosto', body: 'El descanso también es entrenamiento. 8 plazas.',
      deepLink: null, category: 'general', priority: 'BAJA', eventType: 'estudio.aviso',
      resourceType: null, resourceId: null, readAt: haceHoras(60), createdAt: haceHoras(122) },
  ];
  await page.route('**/api/notifications*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items, unread: items.filter(a => a.readAt == null).length }),
  }));
}

test.describe('Avisos', () => {
  test('el subtítulo cuenta lo nuevo y la lista trae los cuatro avisos', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await conAvisosDeterministas(page);
    await page.goto(`/portal/${SLUG}/notificaciones`);

    // Timeout explícito solo en la PRIMERA aserción tras llegar: con `next dev`
    // esta ruta se compila bajo demanda y se pasa de los 5s por defecto. Las
    // siguientes ya corren sobre la pantalla pintada.
    await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible({ timeout: 30_000 });
    // Dos sin leer en el mock → el subtítulo va en letra, no en cifra.
    await expect(page.getByText('Dos cosas nuevas.')).toBeVisible();

    await expect(page.getByText('Tu clase de hoy sigue en pie')).toBeVisible();
    await expect(page.getByText('María Soler cubre el viernes')).toBeVisible();
    await expect(page.getByText('Te quedan 8 sesiones')).toBeVisible();
    await expect(page.getByText('Nuevo taller el 12 de agosto')).toBeVisible();
  });

  test('el sello temporal se escribe en palabras, no en fecha ISO', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await conAvisosDeterministas(page);
    await page.goto(`/portal/${SLUG}/notificaciones`);

    // En el DOM va en minúscula; las versalitas son CSS. Se comprueban las dos
    // mitades, porque `getByText('HACE 2 H')` no encuentra nada aunque en
    // pantalla ponga exactamente eso.
    const sello = page.getByText('hace 2 h', { exact: true });
    await expect(sello).toBeVisible({ timeout: 30_000 });
    await expect(sello).toHaveCSS('text-transform', 'uppercase');
    await expect(page.getByText('ayer', { exact: true })).toBeVisible();
  });

  test('lo ya leído se apaga y pierde el punto', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await conAvisosDeterministas(page);
    await page.goto(`/portal/${SLUG}/notificaciones`);

    const nuevo = page.getByText('Tu clase de hoy sigue en pie').locator('..');
    const leido = page.getByText('Te quedan 8 sesiones').locator('..');

    await expect(nuevo).toHaveCSS('opacity', '1', { timeout: 30_000 });
    // 0.81 exacto: el titular queda en el mismo gris que el diseño.
    await expect(leido).toHaveCSS('opacity', '0.81');
  });

  test('una bandeja vacía dice qué va a aparecer ahí', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinAvisos: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    await expect(page.getByText('Nada nuevo.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Aquí aparecerán tus reservas/)).toBeVisible();
  });

  test('la flecha vuelve a Inicio', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/notificaciones`);

    // Esperar a que la lista esté pintada no es adorno: ese texto solo aparece
    // cuando el efecto de carga ya corrió, y por tanto cuando React ya enganchó
    // el onClick. Sin esto, con la máquina cargada el clic llega antes de la
    // hidratación y no pasa nada. Timeout explícito porque además es la primera
    // aserción tras llegar: `next dev` compila esta ruta bajo demanda.
    await expect(page.getByText('Dos cosas nuevas.')).toBeVisible({ timeout: 30_000 });

    // `link`, no `button`: la flecha pasó a ser un enlace de verdad para que
    // navegue sin depender de la hidratación.
    await page.getByRole('link', { name: 'Volver a Inicio' }).click();
    // Timeout explícito: con `next dev`, la primera navegación a /home compila
    // la ruta bajo demanda y se pasa de los 5s por defecto.
    await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home$`), { timeout: 30_000 });
  });
});
