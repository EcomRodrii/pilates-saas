import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Tentare Widgets»: las vistas del motor que añadió el catálogo
// (lib/widgets/catalogo.ts), verificadas sobre la página pública REAL en modo
// incrustado — la misma URL que genera el constructor:
//   - `tab=planes` (+ `planes=BONO`): «Planes y precios» / «Bonos y packs»
//   - `tab=equipo`: «Instructoras»
//   - `cuenta=completa`: «Mi cuenta» con sus dos caras
// y que ninguna se cuela fuera del modo incrustado ni arrastra las secciones
// de la página completa (1 widget = 1 propósito).
//
// Mismo andamiaje de mocks que e2e/widget-config-params.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare';
const S = 'studio-test';

function fx() {
  const mk = (d: string, h: string, id: string) => ({ id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: 10, cancelada: false });
  return {
    studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@example.com', telefono: '+34 600 000 000', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null, duracionMinutos: 50 }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [
      { id: 'ins-1', studioId: S, nombre: 'Ana Ruiz', rol: 'INSTRUCTOR', activo: true },
      { id: 'ins-2', studioId: S, nombre: 'Bea Gil', rol: 'INSTRUCTOR', activo: false },
    ],
    spots: [],
    planesTarifa: [
      { id: 'p-cuota', studioId: S, tipo: 'MENSUAL', activo: true, precio: 89, nombre: 'Cuota Reformer', periodicidadMeses: 1 },
      { id: 'p-bono', studioId: S, tipo: 'BONO', activo: true, precio: 100, nombre: 'Bono 10 clases', sesiones: 10 },
    ],
    sustitucionesConfirmadas: [],
    sesiones: [mk('12', '10', 's1'), mk('13', '10', 's2')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function abrir(page: Page, query: string) {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  // Contador de eventos del embudo: la vista previa del panel no debe contar.
  const eventos: { tipo: string; origen: string | null }[] = [];
  await page.route('**/api/public/evento**', r => {
    const b = r.request().postDataJSON() as { tipo: string; origen: string | null };
    eventos.push({ tipo: b.tipo, origen: b.origen });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto(`/reservar/${SLUG}?${query}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  return { eventos };
}

test('«Planes y precios»: solo los planes, con su pago, y nada del horario', async ({ page }) => {
  await abrir(page, 'embed=1&tab=planes&ref=web-planes');
  await expect(page.getByRole('heading', { name: 'Bonos y membresías' })).toHaveCount(1);
  await expect(page.getByText('Cuota Reformer')).toBeVisible();
  await expect(page.getByText('Bono 10 clases')).toBeVisible();
  await expect(page.getByRole('button', { name: /Contratar/ })).toHaveCount(2);
  // Ni el horario ni las secciones de la página completa.
  await expect(page.locator('.reserva-slot-row')).toHaveCount(0);
  await expect(page.locator('#bonos-membresias')).toHaveCount(0);
  await expect(page.locator('footer')).toHaveCount(0);
});

test('«Bonos y packs»: `planes=BONO` deja solo los bonos', async ({ page }) => {
  await abrir(page, 'embed=1&tab=planes&planes=BONO');
  await expect(page.getByText('Bono 10 clases')).toBeVisible();
  await expect(page.getByText('Cuota Reformer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Contratar/ })).toHaveCount(1);
});

test('«Instructoras»: el equipo que da clase, y nada más', async ({ page }) => {
  await abrir(page, 'embed=1&tab=equipo');
  await expect(page.getByRole('heading', { name: 'Nuestro equipo' })).toBeVisible();
  // Bea está de baja: no sale (`queImparten`, el mismo criterio que «El estudio»).
  await expect(page.getByText('Ana Ruiz')).toBeVisible();
  await expect(page.getByText('Bea Gil')).toHaveCount(0);
  await expect(page.locator('.reserva-slot-row')).toHaveCount(0);
});

test('«Mi cuenta»: `cuenta=completa` enseña sus dos pestañas y se pasa de una a otra', async ({ page }) => {
  await abrir(page, 'embed=1&tab=misreservas&cuenta=completa');
  const pestanas = page.locator('#horario').getByRole('button');
  await expect(pestanas.filter({ hasText: 'Mis reservas' })).toHaveCount(1);
  await expect(pestanas.filter({ hasText: 'Mi cuenta' })).toHaveCount(1);
  await expect(pestanas.filter({ hasText: 'Clases' })).toHaveCount(0);
  await pestanas.filter({ hasText: 'Mi cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Identifícate para ver tu cuenta' })).toBeVisible();
});

test('⚠️ sin `cuenta=completa`, «Mis reservas» sigue siendo de un solo propósito', async ({ page }) => {
  await abrir(page, 'embed=1&tab=misreservas');
  await expect(page.locator('#horario').getByRole('button').filter({ hasText: 'Mi cuenta' })).toHaveCount(0);
});

test('⚠️ fuera del modo incrustado, `tab=planes` no existe: cae al horario de siempre', async ({ page }) => {
  await abrir(page, 'tab=planes&planes=BONO');
  await expect(page.locator('.reserva-slot-row').first()).toBeVisible({ timeout: 30_000 });
  // Y los planes siguen en su sección, sin filtrar.
  await expect(page.locator('#bonos-membresias')).toContainText('Cuota Reformer');
});

test('la etiqueta `ref` viaja en los eventos, y la vista previa del panel no cuenta', async ({ page }) => {
  const { eventos } = await abrir(page, 'embed=1&tab=clases&ref=web-horario');
  await expect.poll(() => eventos.filter(e => e.tipo === 'widget_loaded').length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(eventos.every(e => e.origen === 'web-horario'), JSON.stringify(eventos)).toBe(true);
});

test('⚠️ `vista-previa=1` (el constructor del panel) no manda ningún evento', async ({ page }) => {
  const { eventos } = await abrir(page, 'embed=1&tab=clases&ref=web-horario&vista-previa=1');
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 30_000 });
  // Margen para que cualquier evento de carga hubiera salido ya.
  await page.waitForTimeout(1500);
  expect(eventos).toEqual([]);
});
