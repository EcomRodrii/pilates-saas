import { test, expect, type Page } from '@playwright/test';
import { SLUG, SESION_ID, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// «Esta clase se está dando AHORA» en la app de la alumna.
//
// Petición del fundador, literal: «una clase de 16:00 a 16:55 y yo entro a las
// 16:30 en la app alumna, ver que esa clase se está dando». La sesión del
// andamiaje es de 10:00 a 10:50 el 2026-08-12, así que el equivalente exacto es
// mirar a las 10:30.
//
// ⚠️ `test.use({ timezoneId })` no es decorativo. La rejilla y las etiquetas se
// pintan en hora del ESTUDIO (`Europe/Madrid`) y las fechas del fixture van sin
// `Z`, así que sin fijar la zona el reloj del runner decide qué hora se ve: el
// mismo test sale verde en CI (UTC) y rojo en un portátil de Madrid, o al revés.
// Es la trampa que costó tres PRs en `arrastrar-clase.spec.ts`
// ([[e2e-calendario-hora-estudio-no-utc]]).
test.use({ timezoneId: 'Europe/Madrid' });

const base = `/portal/${SLUG}`;
/** El fixture pone la clase a las 10:00–10:50 en hora del estudio. */
const A_LAS = (hhmm: string) => new Date(`2026-08-12T${hhmm}:00`);

// ⚠️ Por `data-testid`, no por texto. `getByText('Tu próxima clase')` de Playwright
// busca por SUBCADENA e ignorando mayúsculas, y el estado vacío de esta misma
// pantalla dice «Mira el horario para encontrar tu próxima clase.» — así que un
// localizador por texto encontraba 1 elemento con la tarjeta correctamente
// oculta, y el test acusaba a la funcionalidad de un fallo que era del test. Un
// localizador flojo miente en las dos direcciones.
const badgeEnCurso = (page: Page) => page.getByTestId('badge-en-curso');
/** El rótulo de la tarjeta héroe, EXACTO (ver el aviso de arriba). */
const rotuloProxima = (page: Page) => page.getByText(/^Tu próxima clase$/);
const rotuloEnCurso = (page: Page) => page.getByText(/^Tu clase, en curso$/);

async function montar(page: Page, opciones: { conReserva?: boolean } = {}) {
  await sembrarSociaLista(page);
  if (opciones.conReserva) {
    const f = fixtureSociaLista();
    const socia = f.socia as Record<string, unknown>;
    socia.reservas = [{
      id: 'res-1', studioId: STUDIO_ID, socioId: SOCIO_ID, sesionId: SESION_ID,
      estado: 'CONFIRMADA', creadaEn: '2026-08-11T09:00:00',
    }];
    await page.route('**/api/public/studio-data', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  }
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
}

test.describe('Student PWA · la clase que se está dando ahora', () => {
  test('a media clase el horario dice «En curso», y con la hora en que termina', async ({ page }) => {
    await montar(page);
    await page.clock.setFixedTime(A_LAS('10:30'));
    await page.goto(`${base}/reservar`);

    await expect(badgeEnCurso(page).first()).toBeVisible({ timeout: 30_000 });
    // La hora de fin va DENTRO del badge: «hasta las 10:50». Sin ella, «en curso»
    // no le dice a la alumna si llega o no.
    await expect(page.getByText(/hasta\s+10:50/)).toBeVisible();
  });

  // El corazón de la funcionalidad: la alumna NO recarga. Deja la app abierta y
  // la clase empieza. Si esto falla, el badge solo funciona por casualidad —
  // porque se montó la pantalla en el momento justo.
  test('empieza la clase con la app abierta y el badge aparece solo, sin recargar', async ({ page }) => {
    await montar(page);
    await page.clock.install({ time: A_LAS('09:30') });
    await page.goto(`${base}/reservar`);

    // Antes de empezar: nada de «en curso», y sí el badge de plazas.
    await expect(page.getByText('10 plazas').first()).toBeVisible({ timeout: 30_000 });
    await expect(badgeEnCurso(page)).toHaveCount(0);

    // Pasan 40 minutos con la pestaña abierta. `fastForward` dispara los
    // `setInterval`, que es exactamente lo que hace el reloj de `useAhoraMs`.
    await page.clock.fastForward('40:00');

    await expect(badgeEnCurso(page).first()).toBeVisible();
    // Y las plazas dejan de anunciarse: ya no se puede reservar, así que seguir
    // ofreciendo «10 plazas» sería prometer algo que el servidor rechaza.
    await expect(page.getByText('10 plazas')).toHaveCount(0);
  });

  test('cuando termina, el badge se va solo', async ({ page }) => {
    await montar(page);
    await page.clock.install({ time: A_LAS('10:40') });
    await page.goto(`${base}/reservar`);
    await expect(badgeEnCurso(page).first()).toBeVisible({ timeout: 30_000 });

    // 10:40 + 15 min = 10:55, pasado el fin (10:50).
    await page.clock.fastForward('15:00');
    await expect(badgeEnCurso(page)).toHaveCount(0);
  });

  test('en Inicio su clase deja de ser «tu próxima clase» y pasa a estar en curso', async ({ page }) => {
    await montar(page, { conReserva: true });
    await page.clock.setFixedTime(A_LAS('10:30'));
    await page.goto(base);

    await expect(rotuloEnCurso(page)).toBeVisible({ timeout: 30_000 });
    await expect(rotuloProxima(page)).toHaveCount(0);
    await expect(page.getByText(/hasta las\s+10:50/)).toBeVisible();
  });

  // El bug que había al lado y que este cambio deja arreglado: con el filtro por
  // DÍA, una clase de la mañana ya terminada seguía siendo «tu próxima clase»
  // toda la tarde.
  test('en Inicio una clase ya terminada NO se anuncia como próxima', async ({ page }) => {
    await montar(page, { conReserva: true });
    await page.clock.setFixedTime(A_LAS('16:30'));
    await page.goto(base);

    // Afirmación POSITIVA, no solo la ausencia de la tarjeta: la pantalla tiene
    // que caer en su estado vacío («Mira el horario…»). Un `toHaveCount(0)` a
    // secas también pasaría con la página en blanco o con un error de carga.
    await expect(page.getByText(/Mira el horario para encontrar tu próxima clase/i)).toBeVisible({ timeout: 30_000 });
    await expect(rotuloProxima(page)).toHaveCount(0);
    await expect(rotuloEnCurso(page)).toHaveCount(0);
  });

  test('en Mis clases su reserva de esa clase también lo dice', async ({ page }) => {
    await montar(page, { conReserva: true });
    await page.clock.setFixedTime(A_LAS('10:30'));
    await page.goto(`${base}/mis-reservas`);

    await expect(badgeEnCurso(page).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Confirmada ✓')).toHaveCount(0);
  });
});
