import { test, expect, type Page } from '@playwright/test';
import { AHORA, SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Gamificación en la app de la alumna.
//
// El estudio ya podía configurar créditos, logros, niveles y retos en su panel,
// y el servidor los evalúa de verdad en cada reserva; la alumna no veía nada.
// Lo que rompe aquí: pintar un tablero a cero en un estudio que no la usa,
// enseñar retos ya terminados como si se pudieran ganar, o dejar canjear algo
// que no se puede pagar.

const base = `/portal/${SLUG}`;
const HOY = '2026-08-12'; // el reloj que fija sembrarSociaLista

function conGamificacion() {
  const f = fixtureSociaLista() as Record<string, unknown>;
  f.levelDefinitions = [
    { id: 'n1', studioId: STUDIO_ID, nombre: 'Inicio', orden: 1, umbralCreditos: 0, color: '#aaa', icono: '🌱', beneficios: null },
    { id: 'n2', studioId: STUDIO_ID, nombre: 'Constante', orden: 2, umbralCreditos: 100, color: '#bbb', icono: '⭐', beneficios: 'Prioridad en lista de espera' },
    { id: 'n3', studioId: STUDIO_ID, nombre: 'Veterana', orden: 3, umbralCreditos: 500, color: '#ccc', icono: '🏆', beneficios: null },
  ];
  f.achievementDefinitions = [
    { id: 'l1', studioId: STUDIO_ID, metric: 'CLASES', nombre: 'Diez clases', descripcion: null, umbral: 10, icono: '🔟', creditosRecompensa: 20, activo: true },
    { id: 'l2', studioId: STUDIO_ID, metric: 'CLASES', nombre: 'Primeros pasos', descripcion: null, umbral: 5, icono: '👣', creditosRecompensa: 10, activo: true },
  ];
  f.challengeDefinitions = [
    { id: 'r1', studioId: STUDIO_ID, nombre: 'Agosto activo', descripcion: 'Doce clases este mes', icono: '🔥', metric: 'CLASES', objetivo: 12, fechaInicio: '2026-08-01', fechaFin: '2026-08-31', creditosRecompensa: 50 },
    { id: 'r2', studioId: STUDIO_ID, nombre: 'Reto de julio', descripcion: null, icono: '⏰', metric: 'CLASES', objetivo: 8, fechaInicio: '2026-07-01', fechaFin: '2026-07-31', creditosRecompensa: 30 },
  ];
  f.rewardCatalog = [
    { id: 'p1', studioId: STUDIO_ID, nombre: 'Clase suelta', descripcion: null, costeCreditos: 100, icono: '🎟', activo: true, stock: null, efecto: 'CLASE_GRATIS' },
    { id: 'p2', studioId: STUDIO_ID, nombre: 'Camiseta', descripcion: null, costeCreditos: 500, icono: '👕', activo: true, stock: 3, efecto: 'MANUAL' },
  ];
  const socia = f.socia as Record<string, unknown>;
  socia.memberCredits = [{ socioId: 'socio-e2e-1', studioId: STUDIO_ID, saldo: 150, totalGanado: 250, totalCanjeado: 100, actualizadoEn: '2026-08-10T00:00:00Z' }];
  socia.achievementProgress = [{ id: 'ap1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', achievementId: 'l1', progresoActual: 8, completado: false, completadoEn: null },
    { id: 'ap2', studioId: STUDIO_ID, socioId: 'socio-e2e-1', achievementId: 'l2', progresoActual: 5, completado: true, completadoEn: '2026-08-01T00:00:00Z' }];
  socia.challengeProgress = [{ id: 'cp1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', challengeId: 'r1', progresoActual: 7, completado: false, completadoEn: null }];
  socia.retosApuntados = ['r1'];
  return f;
}

async function montar(page: Page, payload: unknown, opts: { canje?: number; reto?: number } = {}) {
  await sembrarSociaLista(page);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  const peticiones: Array<{ url: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/public/canje', (r) => {
    peticiones.push({ url: '/canje', body: r.request().postDataJSON() as Record<string, unknown> });
    const s = opts.canje ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { ok: true } : { error: 'No tienes créditos suficientes' }) });
  });
  await page.route('**/api/public/retos', (r) => {
    peticiones.push({ url: '/retos', body: r.request().postDataJSON() as Record<string, unknown> });
    const s = opts.reto ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { ok: true } : { error: 'boom' }) });
  });
  return peticiones;
}

test.describe('Student PWA · gamificación', () => {
  test('nivel desde el total GANADO, no desde el saldo', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const nivel = page.getByTestId('nivel');
    await expect(nivel).toBeVisible({ timeout: 30_000 });
    // Ganó 250 históricos y le quedan 150 de saldo: el nivel va por los 250.
    await expect(nivel.getByText('Constante', { exact: false })).toBeVisible();
    await expect(nivel.getByText('150', { exact: false })).toBeVisible();
    await expect(nivel.getByText(/Te faltan 250 créditos para Veterana/)).toBeVisible();
    await expect(nivel.getByText('Prioridad en lista de espera')).toBeVisible();
  });

  test('solo los retos vigentes, con su progreso real', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const retos = page.getByTestId('retos');
    await expect(retos).toBeVisible({ timeout: 30_000 });
    await expect(retos.getByText('Agosto activo', { exact: false })).toBeVisible();
    await expect(retos.getByText(/Reto de julio/)).toHaveCount(0);
    await expect(retos.getByText('7 de 12 · 50 créditos')).toBeVisible();
  });

  test('apuntarse a un reto manda la acción al servidor', async ({ page }) => {
    const p = await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const boton = page.getByTestId('retos').getByRole('button', { name: /ya no participo/i });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.click();
    await expect.poll(() => p.length).toBe(1);
    expect(p[0].body).toEqual({ studioId: STUDIO_ID, retoKey: 'r1', accion: 'desmarcar' });
  });

  test('canjear: solo lo que puede pagar, y el servidor tiene la última palabra', async ({ page }) => {
    const p = await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const rec = page.getByTestId('recompensas');
    await expect(rec).toBeVisible({ timeout: 30_000 });
    // 150 de saldo: la de 100 se puede, la de 500 no y dice cuánto falta.
    await expect(rec.getByText('te faltan 350', { exact: false })).toBeVisible();
    const botones = rec.getByRole('button', { name: /canjear/i });
    await expect(botones.nth(0)).toBeEnabled();
    await expect(botones.nth(1)).toBeDisabled();
    await botones.nth(0).click();
    await expect.poll(() => p.length).toBe(1);
    expect(p[0].body).toEqual({ studioId: STUDIO_ID, catalogItemId: 'p1' });
    // Una clase gratis ya está en su cuenta: mandarla a esperar un aviso del
    // estudio sería falso y retrasaría que la use.
    await expect(page.getByText(/resérvala cuando quieras/i)).toBeVisible();
    await expect(page.getByText(/el estudio te avisará/i)).toHaveCount(0);
  });

  test('si los créditos están a punto de caducar, se dice — y junto a dónde gastarlos', async ({ page }) => {
    // El aviso vive pegado al catálogo a propósito: decirle que caducan sin
    // enseñarle en qué gastarlos es una mala noticia sin salida.
    const f = conGamificacion();
    const socia = f.socia as Record<string, unknown>;
    // ⚠️ Desde AHORA, no desde `Date.now()`: `socia-lista.ts` congela el reloj
    // del navegador con `page.clock.install`, así que «hoy» para la pantalla es
    // el 12-ago-2026. Calculándolo con el reloj real la fecha caía a más de un
    // mes vista y el aviso —correctamente— no salía: el test estaba mal, no el
    // producto.
    const dentroDeCincoDias = new Date(new Date(AHORA).getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    socia.memberCredits = [{
      socioId: 'socio-e2e-1', studioId: STUDIO_ID, saldo: 150, totalGanado: 250,
      totalCanjeado: 100, caducaEl: dentroDeCincoDias, actualizadoEn: '2026-08-10T00:00:00Z',
    }];
    await montar(page, f);
    await page.goto(`${base}/logros`);
    await expect(page.getByText(/caducan en 5 días/i)).toBeVisible({ timeout: 30_000 });
  });

  test('una caducidad lejana NO se avisa: sería ruido', async ({ page }) => {
    const f = conGamificacion();
    const socia = f.socia as Record<string, unknown>;
    const dentroDeMedioAno = new Date(new Date(AHORA).getTime() + 180 * 86_400_000).toISOString().slice(0, 10);
    socia.memberCredits = [{
      socioId: 'socio-e2e-1', studioId: STUDIO_ID, saldo: 150, totalGanado: 250,
      totalCanjeado: 100, caducaEl: dentroDeMedioAno, actualizadoEn: '2026-08-10T00:00:00Z',
    }];
    await montar(page, f);
    await page.goto(`${base}/logros`);
    await expect(page.getByTestId('recompensas')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/caducan/i)).toHaveCount(0);
  });

  test('sin nombre propio configurado, la moneda se llama «créditos»', async ({ page }) => {
    // El nombre viaja por TRES listas blancas hasta aquí (el SELECT de
    // `studio-seo`, `StudioConfig` y `cargarEstudio`), y ninguna falla al
    // omitirlo: llega `undefined` en silencio. Este test ancla el respaldo —
    // que es lo que se vería si alguna de las tres se rompiera— y que la
    // pantalla no revienta al resolverlo.
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const rec = page.getByTestId('recompensas');
    await expect(rec).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Canjea tus créditos')).toBeVisible();
    await expect(rec.getByText('100 créditos')).toBeVisible();
  });

  test('cada recompensa dice qué recibe y qué tiene que hacer después', async ({ page }) => {
    // Sin esto, la alumna espera en casa un aviso que no va a llegar (clase
    // gratis, que ya tiene) o va al mostrador a por algo que ya está en su
    // cuenta. Las dos frases van juntas a propósito: lo que distingue una
    // recompensa de otra es lo que toca hacer luego, no su nombre.
    await montar(page, conGamificacion());
    await page.goto(`${base}/logros`);
    const rec = page.getByTestId('recompensas');
    await expect(rec).toBeVisible({ timeout: 30_000 });
    await expect(rec.getByText(/reserva con ella cuando quieras/i)).toBeVisible();
    await expect(rec.getByText(/te la entregan en el estudio/i)).toBeVisible();
  });

  test('si el servidor rechaza el canje, se dice lo que él dijo', async ({ page }) => {
    await montar(page, conGamificacion(), { canje: 400 });
    await page.goto(`${base}/logros`);
    await page.getByTestId('recompensas').getByRole('button', { name: /canjear/i }).first().click({ timeout: 30_000 });
    await expect(page.getByText(/no tienes créditos suficientes/i)).toBeVisible();
  });

  test('un estudio que no usa gamificación no ve un tablero a cero', async ({ page }) => {
    await montar(page, fixtureSociaLista());
    await page.goto(`${base}/logros`);
    await expect(page.getByText(/aún no ha configurado esto/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nivel')).toHaveCount(0);
    // Y en Inicio tampoco aparece la tarjeta.
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('nivel-inicio')).toHaveCount(0);
  });

  test('Inicio enseña nivel y créditos, y lleva a la pantalla completa', async ({ page }) => {
    await montar(page, conGamificacion());
    await page.goto(base);
    const card = page.getByTestId('nivel-inicio');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('Constante', { exact: false })).toBeVisible();
    await expect(card.getByText('150 créditos →')).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/logros$/);
    void HOY;
  });

  // ── Límite por clienta y ventana de vigencia ───────────────────────────────
  //
  // Lo que se vigila: que la pantalla no ofrezca lo que el servidor va a
  // rechazar (una promoción vencida, una que aún no empieza, una que ella ya
  // se ha llevado) y que tampoco haga desaparecer lo que sí tiene sentido
  // enseñar. El cerrojo real es `reservar_recompensa` en la base de datos;
  // esto comprueba que la app no promete por su cuenta.
  test('la vencida no se ofrece; la futura se ve con su fecha y no se puede pulsar', async ({ page }) => {
    const f = conGamificacion();
    f.rewardCatalog = [
      { id: 'p1', studioId: STUDIO_ID, nombre: 'Siempre disponible', descripcion: null, costeCreditos: 10, icono: '✅', activo: true, stock: null, efecto: 'MANUAL' },
      { id: 'p2', studioId: STUDIO_ID, nombre: 'Promo de julio', descripcion: null, costeCreditos: 10, icono: '⌛', activo: true, stock: null, efecto: 'MANUAL', disponibleHasta: '2026-07-31' },
      { id: 'p3', studioId: STUDIO_ID, nombre: 'Promo de septiembre', descripcion: null, costeCreditos: 10, icono: '🔜', activo: true, stock: null, efecto: 'MANUAL', disponibleDesde: '2026-09-01' },
    ];
    await montar(page, f);
    await page.goto(`${base}/logros`);

    const seccion = page.getByTestId('recompensas');
    await expect(seccion.getByText('Siempre disponible')).toBeVisible({ timeout: 30_000 });
    // Nadie va a poder canjearla nunca más: sobra en la pantalla.
    await expect(seccion.getByText('Promo de julio')).toHaveCount(0);
    // Esta sí se enseña, con su fecha, y con el botón bloqueado.
    await expect(seccion.getByText('Promo de septiembre')).toBeVisible();
    const futura = seccion.locator('div.card').filter({ hasText: 'Promo de septiembre' });
    await expect(futura.getByText(/desde el/i)).toBeVisible();
    await expect(futura.getByRole('button', { name: /canjear/i })).toBeDisabled();
  });

  test('la que ya se ha llevado sigue a la vista, marcada y sin poder canjear', async ({ page }) => {
    const f = conGamificacion();
    f.rewardCatalog = [
      { id: 'p1', studioId: STUDIO_ID, nombre: 'Una por cabeza', descripcion: null, costeCreditos: 10, icono: '🎁', activo: true, stock: null, efecto: 'MANUAL', limitePorSocia: 1 },
    ];
    const socia = f.socia as Record<string, unknown>;
    socia.rewardRedemptions = [
      { id: 'rr1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', catalogItemId: 'p1', creditosGastados: 10, estado: 'ENTREGADO', creadoEn: '2026-08-01T00:00:00Z' },
    ];
    await montar(page, f);
    await page.goto(`${base}/logros`);

    const tarjeta = page.getByTestId('recompensas').locator('div.card').filter({ hasText: 'Una por cabeza' });
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    // Desaparecer daría a entender que el estudio la ha retirado, y no es eso.
    await expect(tarjeta.getByText(/ya la has canjeado/i)).toBeVisible();
    await expect(tarjeta.getByRole('button', { name: 'Canjeada' })).toBeDisabled();
    // Y NO se le dice lo que le falta: tiene saldo de sobra, el problema es otro.
    await expect(tarjeta.getByText(/te faltan/i)).toHaveCount(0);
  });

  test('un canje CANCELADO le devuelve el derecho a volver a canjearla', async ({ page }) => {
    // Cancelar devuelve créditos y stock; tiene que devolver también el turno.
    // Si no, una cancelación del estudio la castigaría.
    const f = conGamificacion();
    f.rewardCatalog = [
      { id: 'p1', studioId: STUDIO_ID, nombre: 'Una por cabeza', descripcion: null, costeCreditos: 10, icono: '🎁', activo: true, stock: null, efecto: 'MANUAL', limitePorSocia: 1 },
    ];
    const socia = f.socia as Record<string, unknown>;
    socia.rewardRedemptions = [
      { id: 'rr1', studioId: STUDIO_ID, socioId: 'socio-e2e-1', catalogItemId: 'p1', creditosGastados: 10, estado: 'CANCELADO', creadoEn: '2026-08-01T00:00:00Z' },
    ];
    await montar(page, f);
    await page.goto(`${base}/logros`);

    const tarjeta = page.getByTestId('recompensas').locator('div.card').filter({ hasText: 'Una por cabeza' });
    await expect(tarjeta.getByRole('button', { name: 'Canjear' })).toBeEnabled({ timeout: 30_000 });
  });
});
