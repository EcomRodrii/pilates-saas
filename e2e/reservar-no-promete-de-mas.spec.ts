import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// /reservar es la página por la que entra una clienta NUEVA. Todo lo que dice
// tiene que ser verdad, y el rediseño (#501) metió tres afirmaciones que no lo
// eran. Esto fija las tres.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const S = 'studio-test';

function iso(diasDesdeHoy: number, hora: number) {
  const d = new Date();
  d.setDate(d.getDate() + diasDesdeHoy);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}

function fixture(extra: Record<string, unknown> = {}) {
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [{ id: 'tc-1', studioId: S, nombre: 'Reformer Flow', color: '#2C352C', nivel: 'TODOS', duracionMin: 50 }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala Norte', capacidad: 8 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana Ferrer', rol: 'INSTRUCTOR', activo: true }],
    spots: [],
    planesTarifa: [
      { id: 'p-bono', studioId: S, nombre: 'Bono 8 clases', precio: 140, tipo: 'BONO', sesiones: 8, activo: true },
      { id: 'p-mes', studioId: S, nombre: 'Mensual Ilimitado', descripcion: 'Clases ilimitadas', precio: 95, tipo: 'MENSUAL', sesiones: null, activo: true },
    ],
    // Solo hay clases mañana. La sesión ANTIGUA es de hace un año, en sábado, a
    // las 7:00 — si el horario se calculara sobre el histórico, saldría.
    sesiones: [
      { id: 's-hoy', studioId: S, tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(1, 10), fin: iso(1, 11), aforoMaximo: 8, cancelada: false },
      { id: 's-antigua', studioId: S, tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: iso(-365, 7), fin: iso(-365, 8), aforoMaximo: 8, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
    ...extra,
  };
}

async function montar(page: Page, extra: Record<string, unknown> = {}) {
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(extra)) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  await page.goto(`/reservar/${SLUG}`);
  await page.getByRole('button', { name: 'El estudio', exact: true }).click();
}

test('el horario no anuncia días que ya no se dan', async ({ page }) => {
  await montar(page);
  // ⚠️ `exact: true`. `getByText('HORARIO')` a secas no distingue mayúsculas ni
  // exige coincidencia completa, así que casaba también el botón «Ver el
  // horario» de la portada en cuanto se añadió — dos elementos, y el localizador
  // se rompe en modo estricto. El rótulo que este test busca es el de la
  // sección de El estudio — Fase 4 del rediseño lo renombró a «HORARIO DE
  // APERTURA» (docs/widget-reservas-fase4-brief-diseno.md, formato 04).
  const horario = page.getByText('HORARIO DE APERTURA', { exact: true }).locator('..');
  await expect(horario).toBeVisible();
  // La sesión de hace un año era en sábado a las 07:00. Ni el día ni la hora
  // pueden aparecer: el cargador público trae TODAS las sesiones sin ventana.
  await expect(horario).not.toContainText('07:00');
});

test('«EL MÁS ELEGIDO» solo sale si lo dice el servidor', async ({ page }) => {
  // Sin el dato (el caso de una visitante anónima), no se destaca nada.
  await montar(page);
  await expect(page.getByText('EL MÁS ELEGIDO')).toHaveCount(0);
});

test('«EL MÁS ELEGIDO» se pinta cuando el servidor manda el ganador', async ({ page }) => {
  await montar(page, { planMasElegidoId: 'p-bono' });
  await expect(page.getByText('EL MÁS ELEGIDO')).toBeVisible();
});

test('un plan mensual dice que es mensual, al lado del botón de pago', async ({ page }) => {
  await montar(page);
  // La descripción del plan («Clases ilimitadas») no puede tapar el hecho de
  // que se cobra CADA MES: el precio lo lleva pegado, y el calificador vuelve
  // al subtítulo en vez de perderse detrás de la descripción.
  await expect(page.getByText('95 €/mes')).toBeVisible();
  await expect(page.getByText('Mensual Ilimitado').locator('..')).toContainText('Mensual · sin compromiso');
});
