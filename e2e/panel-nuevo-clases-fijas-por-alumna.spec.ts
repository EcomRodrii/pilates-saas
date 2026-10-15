import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Calendario › Horario › «Por alumna» (panel nuevo), como «Turnos» de Bonsai
// (b-87): las clases fijas de cada alumna, con lo que pide hacer algo marcado
// (sin cuota, sin clase en su horario) y «Gestionar», que abre la MISMA sección
// de la ficha. Con un 500 al quitar, no dice «quitada» y la clase fija sigue.
// Sin el panel nuevo, el Horario es el de siempre.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const PF = (o: Record<string, unknown>) => ({
  studio_id: 'studio-test', sala_id: 'sala-1', spot_id: null, tipo_clase_id: 'tc-reformer', hora_inicio: '07:15:00',
  vigencia_desde: '2026-08-01', vigencia_hasta: null, estado: 'ACTIVA', pausa_desde: null, pausa_hasta: null,
  pausa_libera_sitio: false, clase_fija_id: null, creada_en: '2026-08-01T09:00:00Z', ...o,
});
// Del andamiaje: Laura (soc-2) tiene cuota mensual; María (soc-1), solo bono; Carmen (soc-3), clase suelta.
const PLAZAS = [
  PF({ id: 'pf-laura', socio_id: 'soc-2', dia_semana: 1 }),
  PF({ id: 'pf-maria', socio_id: 'soc-1', dia_semana: 3, hora_inicio: '19:00:00' }),
  PF({ id: 'pf-carmen', socio_id: 'soc-3', dia_semana: 5, estado: 'PAUSADA' }),
];

async function abrir(page: Page, opts: { panelNuevo?: boolean; falloQuitar?: 500 } = {}) {
  const quitar: unknown[] = [];
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: opts.panelNuevo ?? true,
  }));
  await page.route('**/rest/v1/plazas_fijas**', (r) => json(r, r.request().method() === 'GET' ? PLAZAS : []));
  await page.route('**/api/calendario/horario', (r) => json(r, { ok: true, dias: [], huerfanas: [] }));
  await page.route((u) => u.pathname === '/api/plazas-fijas/estado', (r) => {
    quitar.push(r.request().postDataJSON());
    return opts.falloQuitar ? json(r, { error: 'No se ha podido quitar' }, opts.falloQuitar) : json(r, { ok: true, canceladas: [], mantenidas: [] });
  });
  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Horario', exact: true }).click({ timeout: 60_000 });
  return { quitar };
}

const porAlumna = (page: Page) => page.getByRole('region', { name: 'Clases fijas por alumna' });

test('«Por alumna»: cada alumna con sus clases fijas, y marcado lo que pide hacer algo', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Por alumna' }).click({ timeout: 30_000 });
  const lista = porAlumna(page);
  await expect(lista).toBeVisible();
  await expect(lista.getByText('3 alumnas · 3 clases fijas')).toBeVisible();
  // Por nombre: Carmen, Laura, María.
  await expect(lista.getByRole('listitem').filter({ has: page.getByRole('link') }).first()).toHaveAccessibleName('Carmen Del Río Sánchez');
  const maria = lista.getByRole('listitem', { name: 'María García Fernández' });
  await expect(maria.getByText('Sin cuota que incluya esta clase')).toBeVisible();
  await expect(maria.getByText('Mié 19:00')).toBeVisible();
  const carmen = lista.getByRole('listitem', { name: 'Carmen Del Río Sánchez' });
  await expect(carmen.getByText('En pausa')).toBeVisible();
  await expect(carmen.getByText('Sin cuota que incluya esta clase')).toHaveCount(0);

  // Filtros: «En pausa» deja a Carmen; buscar sin acentos, a María.
  await lista.getByRole('button', { name: 'En pausa' }).click();
  await expect(lista.getByRole('link')).toHaveText(['Carmen Del Río Sánchez']);
  await lista.getByRole('button', { name: 'Todas' }).click();
  await lista.getByRole('searchbox', { name: 'Buscar alumna' }).fill('maria');
  await expect(lista.getByRole('link')).toHaveText(['María García Fernández']);
});

test('«Gestionar» abre la sección de clases fijas de su ficha; con un 500 al quitar no dice «quitada»', async ({ page }) => {
  const { quitar } = await abrir(page, { falloQuitar: 500 });
  await page.getByRole('button', { name: 'Por alumna' }).click({ timeout: 30_000 });
  await porAlumna(page).getByRole('button', { name: 'Gestionar las clases fijas de Laura Martín' }).click();
  const cajon = page.getByRole('dialog', { name: 'Clases fijas de Laura Martín' });
  await expect(cajon).toBeVisible();
  await cajon.getByRole('button', { name: 'Quitar la clase fija del Lunes 07:15' }).click();
  await page.getByRole('dialog', { name: /¿Quitar la clase fija/ }).getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect.poll(() => quitar.length, 'intentos de quitar').toBeGreaterThan(0);
  expect(quitar[0]).toMatchObject({ plazaId: 'pf-laura', estado: 'BAJA' });
  await expect(page.getByText('No se ha podido quitar')).toBeVisible();
  await expect(page.getByText('Clase fija quitada')).toHaveCount(0);
  await expect(cajon.getByRole('button', { name: 'Quitar la clase fija del Lunes 07:15' })).toBeVisible();
});

test('sin el panel nuevo, el Horario no cambia: no hay «Por alumna»', async ({ page }) => {
  await abrir(page, { panelNuevo: false });
  await expect(page.getByText('Todavía no hay clases que se repitan')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Por alumna' })).toHaveCount(0);
});
