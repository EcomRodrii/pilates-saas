import { test, expect, type Page } from '@playwright/test';

// Horas de los fixtures sin zona: navegador en Madrid y reloj con su offset,
// como el resto de specs de /reservar (RES-7-f).
test.use({ timezoneId: 'Europe/Madrid' });

// ─────────────────────────────────────────────────────────────────────────────
// /reservar y los tipos de clase ordenados y archivados (Fase 2 · D).
//
//  · Los chips de tipo salen en el orden que decidió el estudio (`orden`, y
//    los «sin colocar» detrás), aunque el catálogo llegue en otro.
//  · Un tipo archivado SIN clases por delante no tiene chip (daría cero
//    resultados); uno archivado al que aún le quedan clases, sí: esas clases
//    siguen en pie y se pueden reservar.
//  · «Tipos de clase» del estudio solo anuncia los activos.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const S = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture() {
  const mk = (id: string, tipo: string, dia: string, h: string) => ({
    id, studioId: S, tipoClaseId: tipo, salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `${dia}T${h}:00:00`, fin: `${dia}T${h}:50:00`, aforoMaximo: 10, cancelada: false,
  });
  const tipo = (id: string, nombre: string, orden: number | null, archivadoEn: string | null = null) => ({
    id, studioId: S, nombre, color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null, duracionMinutos: 50,
    descripcion: null, orden, archivadoEn,
  });
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12,
    },
    // Desordenados a propósito: el orden lo decide `orden`, no la llegada.
    tiposClase: [
      tipo('tc-m', 'Mat', 2),
      tipo('tc-v', 'Viejo', 3, '2026-08-01T10:00:00+02:00'),
      tipo('tc-b', 'Barre', null),
      tipo('tc-r', 'Reformer', 0),
      tipo('tc-c', 'Circuito', 1, '2026-08-10T10:00:00+02:00'),
    ],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'plan-suelto', studioId: S, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 22, sesiones: 1, activo: true }],
    sesiones: [
      mk('ses-r', 'tc-r', '2026-08-12', '10'),
      mk('ses-m', 'tc-m', '2026-08-12', '11'),
      mk('ses-b', 'tc-b', '2026-08-12', '12'),
      // Archivado, pero aún le queda esta: se puede reservar y tiene chip.
      mk('ses-c', 'tc-c', '2026-08-12', '13'),
      // Archivado y solo con historial: sin chip.
      mk('ses-v', 'tc-v', '2026-08-11', '10'),
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function abrir(page: Page, query: string) {
  await page.clock.install({ time: new Date(`${AHORA}+02:00`) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?${query}`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
}

test('los chips de tipo van en el orden del estudio, con el archivado que aún tiene clases y sin el que ya no', async ({ page }) => {
  await abrir(page, 'tab=clases');
  const chips = page.getByRole('group', { name: 'Filtrar por tipo de clase' }).getByRole('button');
  await expect(chips).toHaveText(['Todas', 'Reformer', 'Circuito', 'Mat', 'Barre'], { timeout: 30_000 });
  // La clase que le queda al archivado sigue ahí para reservarla.
  await expect(page.getByRole('button', { name: /Circuito a las 13:00/ })).toBeVisible();
});

test('«Tipos de clase» del estudio solo anuncia los que se dan hoy', async ({ page }) => {
  await abrir(page, 'tab=estudio');
  const rotulo = page.getByText('TIPOS DE CLASE', { exact: true });
  await expect(rotulo).toBeVisible({ timeout: 30_000 });
  // La rejilla que va justo debajo del rótulo, una tarjeta por tipo.
  const tarjetas = rotulo.locator('xpath=following-sibling::div[1]/div');
  await expect(tarjetas).toHaveCount(3);
  await expect(tarjetas).toContainText(['Reformer', 'Mat', 'Barre']);
});
