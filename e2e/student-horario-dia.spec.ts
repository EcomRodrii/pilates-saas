import { test, expect, type Page } from '@playwright/test';
import { SLUG, conSesiones, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// El horario (P13 + filtros, 5-oct-2026): dos semanas en la tira, un punto en los días con reserva suya, los días sin
// clases apagados, y si hoy ya no queda nada por empezar abre el siguiente día con clases y lo dice. Franja y sala se
// recuerdan en este móvil, y un filtro recordado que no se ve no filtra.
//
// Horas con zona explícita (+02:00) y reloj FIJO (`setFixedTime`: `install` solo no congela) en hora de Madrid: el test
// dice lo mismo con TZ=UTC (el CI).

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
type Fixture = Record<string, unknown>;

async function montar(page: Page, ahora: string, ajustar: (f: Fixture) => void) {
  await sembrarSociaLista(page, { relojMadrid: true });
  await page.clock.setFixedTime(new Date(ahora));
  const f = fixtureSociaLista() as unknown as Fixture;
  ajustar(f);
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: [], aforoReservas: [] })));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
}

const dia = (page: Page, n: RegExp) => page.getByRole('tab', { name: n });

async function abrir(page: Page, ruta = '/reservar') {
  await page.goto(`${base}${ruta}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tablist', { name: 'Día' })).toBeVisible({ timeout: 45_000 });
}

test.describe('Student PWA · horario: el día y los filtros', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('a las 21:00, sin nada por empezar hoy, abre mañana y lo dice; tocar «Hoy» quita el aviso', async ({ page }) => {
    await montar(page, '2026-08-12T21:00:00+02:00', (f) => conSesiones(f, [
      { id: 'ses-10', hora: '09:00' }, { id: 'ses-m', fecha: '2026-08-13', hora: '09:00' },
    ]));
    await abrir(page);
    await expect(dia(page, /^jueves 13/)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('aviso-salto')).toHaveText('Hoy ya no quedan clases por empezar. Te enseñamos las de mañana.');
    await dia(page, /^Hoy/).click();
    await expect(page.getByTestId('aviso-salto')).toHaveCount(0);
    await expect(page.getByTestId('badge-terminada').first()).toBeVisible();
  });

  test('salta a pasado mañana y lo nombra', async ({ page }) => {
    await montar(page, '2026-08-12T21:00:00+02:00', (f) => conSesiones(f, [
      { id: 'ses-10', hora: '09:00' }, { id: 'ses-p', fecha: '2026-08-14', hora: '18:00' },
    ]));
    await abrir(page);
    await expect(page.getByTestId('aviso-salto')).toHaveText('Hoy ya no quedan clases por empezar. Te enseñamos el viernes 14.');
  });

  test('con una clase esta noche, abre hoy y sin aviso', async ({ page }) => {
    await montar(page, '2026-08-12T21:00:00+02:00', (f) => conSesiones(f, [
      { id: 'ses-10', hora: '22:00' }, { id: 'ses-m', fecha: '2026-08-13', hora: '09:00' },
    ]));
    await abrir(page);
    await expect(dia(page, /^Hoy/)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('aviso-salto')).toHaveCount(0);
  });

  test('con una SUYA en curso, se queda en hoy', async ({ page }) => {
    await montar(page, '2026-08-12T20:40:00+02:00', (f) => {
      conSesiones(f, [{ id: 'ses-10', hora: '20:30' }, { id: 'ses-m', fecha: '2026-08-13', hora: '09:00' }]);
      (f.socia as Fixture).reservas = [{ id: 'res-1', socioId: 'socio-e2e-1', sesionId: 'ses-10', estado: 'CONFIRMADA', creadoEn: '2026-08-10T10:00:00Z' }];
    });
    await abrir(page);
    await expect(dia(page, /^Hoy/)).toHaveAttribute('aria-selected', 'true');
  });

  test('un día sin clases está apagado y no se elige; el de su reserva lo dice', async ({ page }) => {
    await montar(page, '2026-08-12T08:00:00+02:00', (f) => {
      conSesiones(f, [{ id: 'ses-10', hora: '10:00' }, { id: 'ses-v', fecha: '2026-08-14', hora: '10:00' }, { id: 'ses-s', fecha: '2026-08-15', hora: '10:00' }]);
      (f.socia as Fixture).reservas = [
        { id: 'res-1', socioId: 'socio-e2e-1', sesionId: 'ses-v', estado: 'CONFIRMADA', creadoEn: '2026-08-10T10:00:00Z' },
        { id: 'res-2', socioId: 'socio-e2e-1', sesionId: 'ses-s', estado: 'LISTA_ESPERA', creadoEn: '2026-08-10T10:00:00Z' },
      ];
    });
    await abrir(page);
    const jueves = dia(page, /^jueves 13/);
    await expect(jueves).toHaveAttribute('aria-disabled', 'true');
    await expect(jueves).toHaveAccessibleName(/sin clases/);
    // Playwright no toca lo que está `aria-disabled` (bien hecho); se fuerza el toque para probar que la tira lo ignora.
    await jueves.click({ force: true });
    await expect(jueves).toHaveAttribute('aria-selected', 'false');
    await expect(dia(page, /^Hoy/)).toHaveAttribute('aria-selected', 'true');
    await expect(dia(page, /^viernes 14/)).toHaveAccessibleName(/con reserva/);
    // En lista de espera aún no tiene plaza: sin punto.
    await expect(dia(page, /^sábado 15/)).not.toHaveAccessibleName(/con reserva/);
  });

  test('la tira cruza de mes y lo dice («1 sep»)', async ({ page }) => {
    await montar(page, '2026-08-25T08:00:00+02:00', (f) => conSesiones(f, [{ id: 'ses-10', fecha: '2026-08-25', hora: '10:00' }]));
    await abrir(page);
    await expect(dia(page, /^martes 1 de sep/)).toBeVisible();
  });

  test('buscando, ni salto ni aviso', async ({ page }) => {
    await montar(page, '2026-08-12T21:00:00+02:00', (f) => conSesiones(f, [
      { id: 'ses-10', hora: '09:00' }, { id: 'ses-m', fecha: '2026-08-13', hora: '09:00' },
    ]));
    await abrir(page, '/reservar?q=reformer');
    await expect(page.getByTestId('aviso-salto')).toHaveCount(0);
    await expect(page.getByText(/· todo el horario/)).toBeVisible();
  });

  const dosSalas = (f: Fixture) => {
    f.salas = [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala Sol', capacidad: 10 }, { id: 'sala-2', studioId: 'studio-test', nombre: 'Sala Luna', capacidad: 10 }];
    conSesiones(f, [{ id: 'ses-10', hora: '10:00' }, { id: 'ses-l', hora: '11:00', salaId: 'sala-2' }, { id: 'ses-t', hora: '18:00' }]);
  };

  test('con dos salas: «Sala ▾» filtra, lo dice y se recuerda al recargar', async ({ page }) => {
    await montar(page, '2026-08-12T08:00:00+02:00', dosSalas);
    await abrir(page);
    await page.getByTestId('filtro-sala').click();
    await page.locator('[role="dialog"]').last().getByRole('button', { name: 'Sala Luna' }).click();
    await expect(page.getByTestId('filtro-sala')).toContainText('Sala Luna');
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('filtro-sala')).toContainText('Sala Luna', { timeout: 45_000 });
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(1);
  });

  test('con una sola sala no hay «Sala ▾», y una sala recordada no filtra', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('alumna:tentare:horario-filtros', JSON.stringify({ franja: 'todo', sala: 'sala-2' })));
    await montar(page, '2026-08-12T08:00:00+02:00', (f) => conSesiones(f, [{ id: 'ses-10', hora: '10:00' }, { id: 'ses-t', hora: '18:00' }]));
    await abrir(page);
    await expect(page.getByTestId('filtro-sala')).toHaveCount(0);
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(2);
  });

  test('si el almacenamiento falla, el horario carga sin filtro', async ({ page }) => {
    // Solo las claves de la alumna: romperlo entero tumbaría la sesión (sb-portal-auth) y el test fallaría por el
    // andamiaje, no por la pantalla.
    await page.addInitScript(() => {
      const leer = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k: string) { if (k.startsWith('alumna:')) throw new Error('bloqueado'); return leer.call(this, k); };
    });
    await montar(page, '2026-08-12T08:00:00+02:00', dosSalas);
    await abrir(page);
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(3);
  });

  test('Mañanas y Tardes cortan a las 14:00', async ({ page }) => {
    await montar(page, '2026-08-12T08:00:00+02:00', (f) => conSesiones(f, [{ id: 'ses-10', hora: '13:30' }, { id: 'ses-t', hora: '14:00' }]));
    await abrir(page);
    await page.getByRole('button', { name: 'Mañanas' }).click();
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="fila-horario"]')).toContainText('13:30');
    await page.getByRole('button', { name: 'Tardes' }).click();
    await expect(page.locator('[data-testid="fila-horario"]')).toContainText('14:00');
  });

  test('vacío con sala y franja: lo dice con sus palabras, y «Quitar filtro» lo quita todo', async ({ page }) => {
    await montar(page, '2026-08-12T08:00:00+02:00', dosSalas);
    await abrir(page);
    await page.getByTestId('filtro-sala').click();
    await page.locator('[role="dialog"]').last().getByRole('button', { name: 'Sala Luna' }).click();
    await page.getByRole('button', { name: 'Tardes' }).click();
    await expect(page.getByText('No hay clases en Sala Luna por la tarde este día')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar filtro' }).click();
    await expect(page.locator('[data-testid="fila-horario"]')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Todo el día' })).toHaveAttribute('aria-pressed', 'true');
  });
});
