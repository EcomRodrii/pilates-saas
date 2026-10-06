import { test, expect, type Page, type Route } from '@playwright/test';
import { montarHome } from './hoy-home-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Cada estado de Tenti en su momento (5-oct-2026 por la noche, fundador: «que
// use todos sus estados y emociones, cada uno en su momento»). Lo decide
// lib/tenti/momentos.ts con el dato de cada sitio; aquí se mira que ese dato
// llega a la cara en Resumen:
//   · la bandeja: con algo esperando tu visto bueno, Tenti en el titular de
//     «Decidir» ('esperaTuOk', o 'agobiado' desde 10); sin nada, el Check;
//     lo que está en marcha, 'trabajando'; si la cifra sube con la pantalla
//     delante, una 'sorpresa';
//   · «Sistema autónomo»: la cifra de automatizaciones de la BANDEJA;
//   · la tira de Hoy: 'dormido' solo si el estudio descansa, siempre con
//     «Tentare sigue atento…»; con un problema, la firma.
// Los mocks propios van DESPUÉS de montarHome() (memoria «mock antes del arnés
// = no existe») y se recarga para que la pantalla los pida.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const json = (r: Route, body: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

function bandeja(nDecidir: number, extra: { enMarcha?: boolean; automatizaciones?: number } = {}) {
  const decidir = nDecidir > 0
    ? [{ id: extra.automatizaciones ? 'automatizacionesEsperando' : 'reservasPorAprobar', n: nDecidir, texto: `${nDecidir} cosas por decidir`, href: '/automatizaciones' }]
    : [];
  return {
    aplica: true, nDecidir,
    titulo: nDecidir === 0 ? 'Nada espera tu visto bueno' : nDecidir === 1 ? 'Una cosa espera tu visto bueno' : `${nDecidir} cosas esperan tu visto bueno`,
    decidir,
    enMarcha: extra.enMarcha ? [{ id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' }] : [],
    resuelto: [],
  };
}

const region = (page: Page) => page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
const titular = (page: Page, texto: string) => region(page).getByText(texto, { exact: true });

test.describe('La bandeja', () => {
  test('con 3 esperando, Tenti en el titular espera tu visto bueno; el texto no cambia', async ({ page }) => {
    let pedidas = 0;
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => { pedidas++; return json(r, bandeja(3)); });
    await page.reload();

    await expect(titular(page, '3 cosas esperan tu visto bueno')).toBeVisible({ timeout: 60_000 });
    expect(pedidas).toBeGreaterThan(0);
    const icono = titular(page, '3 cosas esperan tu visto bueno').locator('[data-tenti-icono]');
    await expect(icono).toHaveAttribute('data-estado', 'esperaTuOk');
    await expect(icono.locator('canvas[data-tenti]')).toHaveAttribute('data-estado', 'esperaTuOk', { timeout: 30_000 });
    await expect(titular(page, '3 cosas esperan tu visto bueno').locator('svg.lucide-check')).toHaveCount(0);
  });

  test('con 12, agobiado (el mismo texto neutro)', async ({ page }) => {
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => json(r, bandeja(12)));
    await page.reload();
    await expect(titular(page, '12 cosas esperan tu visto bueno').locator('[data-tenti-icono]'))
      .toHaveAttribute('data-estado', 'agobiado', { timeout: 60_000 });
  });

  test('sin nada esperando, ningún Tenti en «Decidir»: el Check; lo que está en marcha, trabajando', async ({ page }) => {
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => json(r, bandeja(0, { enMarcha: true })));
    await page.reload();
    await expect(titular(page, 'Nada espera tu visto bueno')).toBeVisible({ timeout: 60_000 });
    await expect(titular(page, 'Nada espera tu visto bueno').locator('[data-tenti-icono]')).toHaveCount(0);
    await expect(titular(page, 'Nada espera tu visto bueno').locator('svg.lucide-check')).toHaveCount(1);
    await expect(region(page).getByText('Tentare lo está haciendo').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'trabajando');
  });

  test('si la bandeja sube con la pantalla delante, una sorpresa (y al cargar, ninguna)', async ({ page }) => {
    let n = 2;
    let pedidas = 0;
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => { pedidas++; return json(r, bandeja(n)); });
    await page.reload();
    const icono = () => region(page).locator('[data-tenti-icono]').first();
    await expect(icono()).toHaveAttribute('data-estado', 'esperaTuOk', { timeout: 60_000 });
    await expect(icono().locator('canvas[data-tenti]')).toHaveCount(1, { timeout: 30_000 });
    // Las emociones esperan a verse: la bandeja va debajo de la agenda.
    await icono().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await expect(icono().locator('canvas[data-tenti]')).not.toHaveAttribute('data-emocion', /.+/);

    // Algo nuevo que decidir: la bandeja se invalida (lo que hace
    // `invalidarEstadoEstudio()` al resolver algo) y vuelve a pedirse.
    const antes = pedidas;
    n = 3;
    await page.evaluate(() => window.dispatchEvent(new Event('tentare-estado-estudio-cambiado')));
    await expect.poll(() => pedidas).toBeGreaterThan(antes);
    await expect(titular(page, '3 cosas esperan tu visto bueno')).toBeVisible();
    await expect(icono().locator('canvas[data-tenti]')).toHaveAttribute('data-emocion', 'sorpresa', { timeout: 10_000 });
  });
});

test.describe('«Sistema autónomo» sigue a la bandeja', () => {
  test('con automatizaciones esperando en la bandeja, espera tu visto bueno', async ({ page }) => {
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => json(r, bandeja(2, { automatizaciones: 2 })));
    await page.reload();
    const enlace = page.getByRole('link', { name: /Sistema autónomo/ });
    await expect(enlace).toContainText('2 casos requieren tu atención', { timeout: 60_000 });
    await expect(enlace.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'esperaTuOk');
    // Dentro de un enlace: sin traje y sin dejarse tocar.
    await expect(enlace.locator('[data-tenti-icono]')).not.toHaveAttribute('data-traje', /.+/);
  });

  test('con la bandeja sin contestar, reposo: la cara no afirma lo que no ha contado', async ({ page }) => {
    await montarHome(page);
    await page.route('**/api/estado-estudio**', (r) => json(r, {}, 500));
    await page.reload();
    const enlace = page.getByRole('link', { name: /Sistema autónomo/ });
    await expect(enlace).toBeVisible({ timeout: 60_000 });
    await expect(enlace.locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
  });
});

test.describe('La tira de Hoy', () => {
  test('con un problema por resolver, la firma: nunca una cara dormida', async ({ page }) => {
    await montarHome(page);
    const tira = page.getByText(/^Tentare ha encontrado/);
    await expect(tira).toBeVisible({ timeout: 60_000 });
    await expect(tira.locator('xpath=..').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'reposo');
  });

  test('sin clases hoy, el estudio descansa: dormido, y la frase dice que Tentare sigue', async ({ page }) => {
    await montarHome(page, { calendarioVacio: true });
    const tira = page.getByText('Hoy no hay clases. Tentare sigue atento a las reservas y los avisos.');
    await expect(tira).toBeVisible({ timeout: 60_000 });
    await expect(tira.locator('xpath=..').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'dormido');
  });

  test('con todas las clases ya dadas y nada pendiente, dormido; otro día, nunca', async ({ page }) => {
    await montarHome(page);
    // DESPUÉS del arnés: un día de una sola clase, ya dada y con la lista pasada.
    let pedidas = 0;
    await page.route('**/api/calendario**', (r) => {
      pedidas++;
      return json(r, {
        sesiones: [{
          id: 'ses-dada', studioId: 'studio-test', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
          inicio: '2026-09-08T06:00:00.000Z', fin: '2026-09-08T07:00:00.000Z', aforoMaximo: 4, cancelada: false,
          notas: null, precioPuntual: null, serieId: null, incidenciaTexto: null, googleEventId: null, sustitucionAbierta: false,
        }],
        reservas: [0, 1, 2, 3].map((i) => ({
          id: `rd${i}`, studioId: 'studio-test', sesionId: 'ses-dada', socioId: `soc-${i}`, estado: 'ASISTIDA',
          spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: '2026-09-08T06:05:00.000Z',
          creadoEn: '2026-09-01T09:00:00.000Z', confirmacionPedidaEn: null, confirmadoEn: null, valoracionExperiencia: null,
        })),
        salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala Reformer', capacidad: 10, color: '#6366F1', fotoUrl: null }],
        instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Marta', email: null, telefono: null, color: '#8A9165', activo: true, avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null, bio: null }],
      });
    });
    await page.reload();
    const tira = page.getByText('Hoy ya no quedan clases. Tentare sigue atento a las reservas y los avisos.');
    await expect(tira).toBeVisible({ timeout: 60_000 });
    expect(pedidas).toBeGreaterThan(0);
    await expect(tira.locator('xpath=..').locator('[data-tenti-icono]')).toHaveAttribute('data-estado', 'dormido');

    // Otro día no hay estudio que descanse: la tira se va (no hay nada que contar).
    await page.getByRole('button', { name: 'Día anterior' }).click();
    await expect(page.getByText(/Tentare sigue atento/)).toHaveCount(0);
    await expect(page.locator('[data-tenti-icono][data-estado="dormido"]')).toHaveCount(0);
  });
});
