import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Una clase que ya ha empezado no se cancela ni se borra.
//
// Antes, «Cancelar» y la papelera seguían activas en una clase ya dada:
// cancelarla avisaba de la cancelación a quien ya había venido y le devolvía la
// sesión del bono, y borrarla se llevaba su asistencia (las reservas caen en
// cascada). Ahora los dos botones salen apagados con el motivo, y las funciones
// que cancelan o borran lo comprueban también (lib/calendario-estado.ts).
//
// Con contador: que no salga ninguna escritura en la pasada no demuestra nada si
// el contador no ve las escrituras. Por eso la futura SÍ escribe al cancelar.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const ahora = Date.now();
const clase = (id: string, desdeAhoraMin: number) => ({
  id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-reformer', sala_id: 'sala-1', instructor_id: 'ins-marta',
  inicio: new Date(ahora + desdeAhoraMin * 60_000).toISOString(),
  fin: new Date(ahora + (desdeAhoraMin + 50) * 60_000).toISOString(),
  aforo_maximo: 6, cancelada: false, notas: null, google_event_id: null, serie_id: null,
  incidencia_texto: null, precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
});
// Empezó hace 2 h (ya terminó) y otra dentro de dos días.
const SESIONES = [clase('ses-dada', -120), clase('ses-futura', 2 * 24 * 60)];

async function abrir(page: Page, id: string) {
  await montar(page);
  // DESPUÉS de `montar`: ganan a sus comodines.
  const escrituras: string[] = [];
  await page.route('**/rest/v1/sesiones**', (r) => {
    const m = r.request().method();
    if (m !== 'GET') { escrituras.push(`${m} ${new URL(r.request().url()).search}`); return json(r, []); }
    return json(r, SESIONES);
  });
  await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, {
    sesiones: SESIONES.map((s) => ({
      id: s.id, studioId: STUDIO_ID, tipoClaseId: s.tipo_clase_id, salaId: s.sala_id, instructorId: s.instructor_id,
      inicio: s.inicio, fin: s.fin, aforoMaximo: s.aforo_maximo, cancelada: false, notas: null, precioPuntual: null,
      serieId: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
    })),
    reservas: [], sustituciones: [],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 6 }],
    instructores: [{ id: 'ins-marta', studioId: STUDIO_ID, nombre: 'Marta Ruiz', rol: 'INSTRUCTOR', color: '#D9C29E', activo: true }],
    horaApertura: '00:00', horaCierre: '23:59', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await ir(page, `calendario?sesion=${id}`);
  return { escrituras };
}

test('en una clase que ya ha empezado, «Cancelar» y la papelera salen apagadas y no se escribe nada', async ({ page }) => {
  const { escrituras } = await abrir(page, 'ses-dada');
  const cancelar = page.getByRole('button', { name: 'Cancelar', exact: true });
  const eliminar = page.getByRole('button', { name: 'Eliminar sesión' });
  await expect(cancelar).toBeVisible({ timeout: 30_000 });
  await expect(cancelar).toBeDisabled();
  await expect(eliminar).toBeDisabled();
  await expect(cancelar).toHaveAttribute('title', /no se cancela ni se borra/);

  await cancelar.click({ force: true });
  await eliminar.click({ force: true });
  await page.waitForTimeout(800);
  expect(escrituras, 'se ha escrito sobre una clase que ya se dio').toEqual([]);
});

test('en una clase futura sí se cancela: el contador ve la escritura', async ({ page }) => {
  const { escrituras } = await abrir(page, 'ses-futura');
  const cancelar = page.getByRole('button', { name: 'Cancelar', exact: true });
  await expect(cancelar).toBeEnabled({ timeout: 30_000 });
  await cancelar.click();
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /cancelar (la )?clase|sí, cancelar/i }).click();
  await expect.poll(() => escrituras.length, { timeout: 15_000 }).toBeGreaterThan(0);
});
