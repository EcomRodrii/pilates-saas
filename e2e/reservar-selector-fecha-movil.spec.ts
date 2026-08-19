import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P0 de la auditoría "Veredicto de Marta" (evaluación de cliente 2026-08-19):
// en tentare.app/reservar/tentare, en viewport MÓVIL, un toque sobre un día
// que no fuera "hoy" en la tira de fecha (TiraDias, `estiloDias='dias'`) no
// cambiaba de día — el número quedaba resaltado en azul (selección de texto
// del navegador) en vez de disparar `onClick`. Reproducido de forma
// independiente contra producción real, con un tap preciso sobre el propio
// `ref` del botón (descartado el fallo de coordenadas).
//
// La causa: los botones de la tira no tenían `user-select: none` ni
// `touch-action: manipulation` — en un contenedor con scroll horizontal
// (`overflowX: auto`, `scrollSnapType`), eso deja que un toque se interprete
// como el inicio de una selección de texto en vez de un tap. Arreglado en
// tira-dias.tsx y en el equivalente de reserva-calendario.tsx (tira 'semana',
// mismo patrón, portal privado).
//
// Es exactamente el criterio de SPECS_WEBKIT (playwright.config.ts): pública,
// y la sufre una clienta desde su móvil sin que nadie en el estudio se entere.
// El bug no se veía con `.click()` de Playwright en escritorio —solo con
// semántica táctil real (WebKit + `hasTouch`)— así que esta spec vive en el
// proyecto webkit-publico, no en chromium.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const FECHA = '2026-08-19';
const AHORA = `${FECHA}T08:00:00`;

function studioDataFixture() {
  const manana = '2026-08-20';
  return {
    studio: {
      id: 'studio-test', nombre: 'Tentare', slug: SLUG, ciudad: 'Málaga', direccion: 'Calle Test 1',
      email: 'hola@tentare.app', telefono: '+34 000 000 000', cancelacionVentanaHoras: 12,
    },
    tiposClase: [
      { id: 'tc-mat', studioId: 'studio-test', nombre: 'Mat + Circuito', color: '#6D28D9', nivel: 'TODOS' },
    ],
    salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Rosi', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [],
    sesiones: [
      // Nada hoy — solo mañana, igual que el hallazgo real (19 vacío, 20 con 1 clase).
      { id: 'ses-manana', studioId: 'studio-test', tipoClaseId: 'tc-mat', salaId: 'sala-1', instructorId: 'ins-1', inicio: `${manana}T13:00:00`, fin: `${manana}T13:50:00`, aforoMaximo: 10, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], aforoReservas: [],
    socia: null,
  };
}

async function mockBackend(page: Page) {
  await page.route('**/rest/v1/**', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      } });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'studio-test' }),
    });
  });
  await page.route('**/api/public/studio-data', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioDataFixture()) }));
  await page.route('**/api/public/session', route =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No hay ninguna socia con este email en el estudio' }) }));
  await page.route('**/api/theme**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
}

test('⚠️ tocar un día distinto de hoy en la tira de fecha SÍ cambia de día, en móvil', async ({ page }, testInfo) => {
  // `.tap()` exige `hasTouch` — solo el proyecto webkit-publico (iPhone 13
  // emulado) lo activa. En chromium esta misma interacción ya la cubre
  // reservar-ventana-por-tipo.spec.ts con `.click()`; repetirla ahí con
  // `.tap()` lanzaría "does not support tap" sin probar nada nuevo.
  test.skip(testInfo.project.name !== 'webkit-publico', 'Reproduce un gotcha táctil — solo tiene sentido con hasTouch real (webkit-publico)');

  await page.clock.install({ time: new Date(AHORA) });
  await mockBackend(page);
  await page.goto(`/reservar/${SLUG}`);

  const tabHoy = page.getByRole('tab', { name: /19 de agosto/i });
  await expect(tabHoy).toBeVisible({ timeout: 30_000 });
  await expect(tabHoy).toHaveAttribute('aria-selected', 'true');

  const tabManana = page.getByRole('tab', { name: /20 de agosto/i });
  await tabManana.tap();

  await expect(tabManana, 'el toque no cambió el día seleccionado — se quedó en "hoy"').toHaveAttribute('aria-selected', 'true');
  await expect(tabHoy).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('button', { name: /Mat \+ Circuito a las/i })).toBeVisible();
});
