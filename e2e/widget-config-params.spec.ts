import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El motor de parámetros del snippet embebido (lib/reservar/config-widget.ts),
// verificado en Modo A (`/reservar/[slug]?embed=1&...`). Cada parámetro tiene
// que hacer lo que dice DE VERDAD — cero decorativo — y, sin parámetros, el
// widget tiene que seguir EXACTAMENTE igual que hoy (regresión).
//
// Mismo andamiaje de mocks que e2e/reservar-acoplar-widget.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare'; const S = 'studio-test';
function fx() {
  const mk = (d: string, h: string, id: string, tipo = 'tc-r', ins = 'ins-1') => ({ id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: ins, inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false });
  return { studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [
      { id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: S, nombre: 'Mat', color: '#52607C', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [
      { id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' },
      { id: 'ins-2', studioId: S, nombre: 'Bea', rol: 'INSTRUCTOR' },
    ],
    spots: [],
    // PUNTUAL activo: sin socia, cada clase enseña «Reservar · 15 €» — la
    // materia prima de `ocultar-precio`.
    planesTarifa: [{ id: 'p1', studioId: S, tipo: 'PUNTUAL', activo: true, precio: 15, nombre: 'Clase suelta' }],
    // s1 (Reformer hoy 10:00) la da Ana sustituyendo a Bea — la materia prima
    // de `ocultar-sustituta`.
    sustitucionesConfirmadas: [{ sesionId: 's1', instructorOriginalId: 'ins-2' }],
    sesiones: [mk('12', '10', 's1', 'tc-r'), mk('12', '12', 's2', 'tc-m'), mk('13', '10', 's3', 'tc-r')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null };
}
async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

async function abrir(page: Page, q: string) {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?embed=1&tab=clases${q}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  // La primera fila de clase del día — señal de que los datos ya pintaron.
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
}

const tabsDia = (page: Page) => page.getByRole('tablist', { name: 'Elegir día' }).getByRole('tab');

test('⚠️ regresión: sin parámetros nuevos, todo sigue exactamente igual', async ({ page }) => {
  await abrir(page, '');
  // Tira de 10 días, los dos tipos visibles, y la hoja con precio, nivel y
  // aviso de sustitución — el estado de partida que los toggles apagan.
  await expect(tabsDia(page)).toHaveCount(10);
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2); // Reformer 10:00 + Mat 12:00 (hoy)
  await page.locator('.reserva-slot-row', { hasText: 'Reformer' }).click();
  const hoja = page.getByRole('dialog');
  await expect(hoja.locator('.reserva-cta-btn')).toHaveText(/Reservar · 15 €/);
  await expect(hoja.getByText('Todos los niveles')).toBeVisible();
  await expect(hoja.getByText('Sustituye a Bea hoy')).toBeVisible();
});

test('un filtro de tipo enseña SOLO ese tipo (listado y chips)', async ({ page }) => {
  await abrir(page, '&tipos=tc-m');
  const filas = page.locator('.reserva-slot-row');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Mat');
  // El chip del tipo excluido desaparece: un chip que siempre da cero
  // resultados es un control roto.
  const chips = page.getByRole('group', { name: 'Filtrar por tipo de clase' });
  await expect(chips.getByRole('button', { name: 'Mat' })).toBeVisible();
  await expect(chips.getByRole('button', { name: 'Reformer' })).toHaveCount(0);
});

test('filtro por instructora, por id', async ({ page }) => {
  // Solo Ana da clases en el fixture; filtrar por Bea (que únicamente aparece
  // como sustituida) tiene que dejar el día sin clases de ella.
  await abrir(page, '&instructoras=ins-1');
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
});

test('⚠️ ocultar-precio quita el precio DE VERDAD, no solo del botón', async ({ page }) => {
  await abrir(page, '&ocultar-precio=1');
  await page.locator('.reserva-slot-row', { hasText: 'Reformer' }).click();
  const hoja = page.getByRole('dialog');
  await expect(hoja.locator('.reserva-cta-btn')).toHaveText('Reservar');
  // Ni en la línea de cobertura ni en ningún otro rincón de la hoja.
  await expect(hoja).not.toContainText('€');
});

test('ocultar-nivel y ocultar-sustituta apagan cada uno lo suyo', async ({ page }) => {
  await abrir(page, '&ocultar-nivel=1&ocultar-sustituta=1');
  await page.locator('.reserva-slot-row', { hasText: 'Reformer' }).click();
  const hoja = page.getByRole('dialog');
  await expect(hoja.getByText('Reformer')).toBeVisible();
  await expect(hoja.getByText('Todos los niveles')).toHaveCount(0);
  await expect(hoja.getByText('Sustituye a Bea hoy')).toHaveCount(0);
  // Sin el aviso queda el rótulo de rol de siempre, no un hueco.
  await expect(hoja.getByText('Instructora')).toBeVisible();
  // Y el precio sigue: los toggles son independientes.
  await expect(hoja.locator('.reserva-cta-btn')).toHaveText(/15 €/);
});

test('vista=hoy abre en hoy y SOLO hoy', async ({ page }) => {
  await abrir(page, '&vista=hoy');
  await expect(tabsDia(page)).toHaveCount(1);
  await expect(page.getByText('hoy', { exact: false }).first()).toBeVisible();
  // Las dos de hoy sí; la de mañana no tiene ningún día al que pertenecer.
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
});

test('marca= pisa el color primario del widget', async ({ page }) => {
  await abrir(page, '&marca=%23112233');
  const todas = page.getByRole('group', { name: 'Filtrar por tipo de clase' }).getByRole('button', { name: 'Todas' });
  await expect(todas).toHaveCSS('background-color', 'rgb(17, 34, 51)');
});

test('⚠️ la página SUELTA ignora los parámetros del snippet', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await mocks(page);
  await page.goto(`/reservar/${SLUG}?tipos=tc-m&ocultar-precio=1&vista=hoy&marca=%23112233`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  // Sin embed=1 nada de esto aplica: los dos tipos, la tira completa.
  await expect(page.locator('.reserva-slot-row')).toHaveCount(2);
  await expect(tabsDia(page)).toHaveCount(10);
  await page.locator('.reserva-slot-row', { hasText: 'Reformer' }).click();
  await expect(page.getByRole('dialog').locator('.reserva-cta-btn')).toHaveText(/Reservar · 15 €/);
});
