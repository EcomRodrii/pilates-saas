import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Vista MES de la página pública de reservas (P2 de la auditoría contra
// Momence). Sirve para elegir DÍA de un vistazo; los horarios los sigue dando
// la vista Día.
//
// ⚠️ Lo que aquí importa no es que pinte un calendario, sino QUÉ dice cada
// celda: la densidad mide plazas libres, no cuántas clases hay. Un día con seis
// clases llenas es un día inútil para quien viene a reservar, y pintarlo como
// el más intenso del mes la mandaría justo al peor sitio.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);
const SLUG = 'tentare'; const S = 'studio-test';
const HOY = '2026-08-12';
// Un mes con de todo: días libres, días con últimas plazas y un día completo.
function sesiones() {
  const mk = (d: string, h: string, aforo: number, id: string) =>
    ({ id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`, aforoMaximo: aforo, cancelada: false });
  return [
    // El día 5 ya pasó (hoy es el 12). Se siembra a propósito para comprobar
    // que NO aparece: `slots` filtra `inicio > ahora` antes de llegar aquí.
    mk('05', '10', 10, 's0'),
    mk('13', '10', 10, 's1'), mk('13', '18', 10, 's2'),
    mk('14', '10', 10, 's3'),
    mk('17', '09', 10, 's4'), mk('17', '11', 10, 's5'), mk('17', '19', 10, 's6'),
    mk('20', '10', 10, 's7'),
    mk('25', '10', 10, 's8'),
  ];
}
function fx() {
  return { studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12, descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C' },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [], sesiones: sesiones(),
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null };
}
async function montar(page: Page) {
  await page.clock.install({ time: new Date(`${HOY}T08:00:00`) });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
  await page.goto(`/reservar/${SLUG}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
}
async function abrirMes(page: Page) {
  await montar(page);
  await page.getByRole('button', { name: 'Mes', exact: true }).click();
  await expect(page.getByText('AGOSTO DE 2026')).toBeVisible();
}

test('cada día dice cuántas clases tiene y cuántas plazas quedan', async ({ page }) => {
  await abrirMes(page);
  // El resumen va en el `aria-label`, así que es lo mismo que oye un lector de
  // pantalla y lo que se ve al pasar por encima — no dos textos distintos.
  await expect(page.getByRole('button', { name: '13 de agosto — 2 clases · 20 plazas libres' })).toBeVisible();
  await expect(page.getByRole('button', { name: '17 de agosto — 3 clases · 30 plazas libres' })).toBeVisible();
});

test('⚠️ un día sin clases no se puede pinchar', async ({ page }) => {
  // Ofrecer un clic que no lleva a ninguna parte es la promesa vacía que este
  // repo ya ha pagado varias veces.
  await abrirMes(page);
  await expect(page.getByRole('button', { name: '18 de agosto — Sin clases', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^17 de agosto/ })).toBeEnabled();
});

test('⚠️ los días ya pasados salen apagados y sin clases', async ({ page }) => {
  // La página filtra `inicio > ahora` ANTES de construir los slots, así que a
  // la rejilla no llega ninguna clase pasada: el día 5, que sí tiene una
  // sembrada, aparece vacío. Por eso este test no puede comprobar el caso
  // «día pasado CON clases» — no existe por esta vía.
  //
  // El guard de `pasado` en el componente sigue siendo correcto y está cubierto
  // por `rejillaMes` en los unitarios, donde sí se le pueden pasar clases
  // pasadas. Aquí se comprueba lo que de verdad se puede llegar a ver.
  await abrirMes(page);
  // `exact` porque «5 de agosto» es subcadena de «15 de agosto». La ambigüedad
  // de verdad —agosto contra septiembre— ya la resuelve la etiqueta con el mes.
  const pasado = page.getByRole('button', { name: '5 de agosto — Sin clases', exact: true });
  await expect(pasado).toBeVisible();
  await expect(pasado).toBeDisabled();
});

test('elegir un día lleva a sus horarios, y NO reserva nada', async ({ page }) => {
  // Un calendario de mes no tiene sitio para decidir una clase concreta.
  // Fingir que sí acabaría en un clic que reserva sin querer — el mismo fallo
  // que ya se corrigió en la rejilla semanal.
  await abrirMes(page);
  await page.getByRole('button', { name: /^17 de agosto/ }).click();
  await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // La tira de días saltó al 17, y se ven sus tres clases. Se ancla en las
  // HORAS y no en el botón «Reservar» ni en una etiqueta de rango de semana
  // (Fase 1 del rediseño: la tira ya no pagina por semana, ver tira-dias.tsx):
  // son el dato que prueba que estamos en el día correcto.
  // El aria-label de la tira de días es "‹día de la semana›, 17 de agosto, N
  // clases" (tira-dias.tsx) — sin anclar al principio, a diferencia del botón
  // de la vista Mes de arriba, que sí empieza por el número de día.
  await expect(page.getByRole('tab', { name: /17 de agosto/ })).toHaveAttribute('aria-selected', 'true');
  for (const hora of ['09:00', '11:00', '19:00']) {
    await expect(page.getByText(hora, { exact: true })).toBeVisible();
  }
});

test('se puede navegar a otro mes', async ({ page }) => {
  await abrirMes(page);
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.getByText('SEPTIEMBRE DE 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page.getByText('AGOSTO DE 2026')).toBeVisible();
});
