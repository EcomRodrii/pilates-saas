import { test, expect, type Page } from '@playwright/test';
import { SLUG, SESION_ID, conBono, conSesiones, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La fila del horario, copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026): la foto de la clase, el
// nombre, la hora, la sala y la instructora, el chip de plazas y la flecha. Toda la fila lleva a la ficha, que es donde
// se reserva: «Reservar» desde la fila (P11-P12, 5-oct) salió con la maqueta, y con él sus pruebas de escritura (las
// mismas comprobaciones viven en las de la hoja de la ficha: student-hoja-reserva*.spec.ts).

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
type Fixture = Record<string, unknown>;

/** La clase del fixture a las 10:00 de Madrid (con zona) y el reloj a las 08:00 de Madrid. */
async function montar(page: Page, ajustar: (f: Fixture) => void = () => {}, o: { relectura?: (f: Fixture) => void; aforo?: unknown[] } = {}) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const f = conSesiones(fixtureSociaLista() as unknown as Fixture, [{ id: SESION_ID, hora: '10:00' }]);
  ajustar(f);
  let pedidas = 0;
  await page.route('**/api/public/studio-data', (r) => {
    pedidas += 1;
    // La relectura tras reservar puede traer la reserva o no (el servidor la escribió, la réplica aún no): la fila no
    // puede adelantarse a los datos.
    if (pedidas > 1 && o.relectura) { const g = structuredClone(f); o.relectura(g); return r.fulfill(json(g)); }
    return r.fulfill(json(f));
  });
  if (o.aforo) await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: o.aforo })));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  return { pedidas: () => pedidas };
}

const fila = (page: Page) => page.locator(`[data-testid="fila-horario"][data-clase="${SESION_ID}"]`);

async function abrirHorario(page: Page) {
  await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
  await expect(fila(page)).toBeVisible({ timeout: 45_000 });
}

test.describe('Student PWA · horario: la fila de una clase', () => {
  test.describe.configure({ timeout: 120_000 });
  // ⚠️ Sin service worker: en el build de producción la app registra `/sw.js`, y en WebKit sus `fetch` pasan por él y
  // `page.route` no los ve.
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('la fila entera lleva a la ficha y no lleva botón de reservar', async ({ page }) => {
    await montar(page, (f) => conBono(f));
    await abrirHorario(page);
    await expect(fila(page)).toHaveAttribute('href', `${base}/reservar/${SESION_ID}`);
    await expect(fila(page).getByRole('button')).toHaveCount(0);
    await expect(fila(page)).toContainText('10:00 · 50 min');
    await fila(page).click();
    await expect(page).toHaveURL(`${base}/reservar/${SESION_ID}`, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Reservar clase$/ })).toBeVisible({ timeout: 30_000 });
  });

  test('el chip dice las plazas libres; la última, «1 plaza» y en el tono de alerta', async ({ page }) => {
    await montar(page, (f) => { f.aforoReservas = Array.from({ length: 9 }, (_, i) => ({ id: `a-${i}`, sesion_id: SESION_ID, estado: 'CONFIRMADA' })); });
    await abrirHorario(page);
    const chip = fila(page).locator('.badge');
    await expect(chip).toHaveText('1 plaza');
    await expect(chip).toHaveClass(/badge--ultima/);
  });

  // ── La foto de la clase ──
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  async function fotos(page: Page) {
    await page.route(/\/(tipo|sala)-propia\.png/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  }

  test('foto del tipo de clase en el cuadro, con el logo en una esquina', async ({ page }) => {
    await fotos(page);
    await montar(page, (f) => { const t = (f.tiposClase as Fixture[])[0]; t.fotoUrl = 'https://cdn.example.com/tipo-propia.png'; t.logoUrl = 'https://cdn.example.com/logo.png'; });
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase').locator('img')).toHaveAttribute('src', /tipo-propia\.png/);
    await expect(fila(page).getByTestId('logo-clase')).toBeVisible();
  });

  test('sin foto del tipo, la de su sala', async ({ page }) => {
    await fotos(page);
    await montar(page, (f) => { (f.salas as Fixture[])[0].fotoUrl = 'https://cdn.example.com/sala-propia.png'; });
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase').locator('img')).toHaveAttribute('src', /sala-propia\.png/);
  });

  test('sin foto propia, la de por defecto de su disciplina (como en la maqueta, nunca una inicial)', async ({ page }) => {
    await montar(page);
    await abrirHorario(page);
    await expect(fila(page).getByTestId('foto-clase').locator('img')).toHaveAttribute('src', /por-defecto/);
  });

  test('un nombre largo ocupa hasta dos líneas', async ({ page }) => {
    await montar(page, (f) => { (f.tiposClase as Fixture[])[0].nombre = 'Reformer avanzado con trabajo de suelo pélvico y respiración'; });
    await abrirHorario(page);
    const caja = await fila(page).locator('.fila-horario__nombre').boundingBox();
    const linea = await fila(page).locator('.fila-horario__nombre').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 20);
    expect(caja!.height, 'el nombre no ocupa dos líneas').toBeGreaterThan(linea * 1.5);
    expect(caja!.height, 'el nombre pasa de dos líneas').toBeLessThan(linea * 2.6);
  });

  test('Calendario dice «Cuota» a quien tiene cuota', async ({ page }) => {
    await montar(page, (f) => conBono(f, { cuota: true }));
    await page.goto(`${base}/calendario`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Cuota', { exact: true }).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('1 sesión', { exact: true })).toHaveCount(0);
  });
});
