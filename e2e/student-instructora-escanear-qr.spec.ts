import { test, expect, type Page, type Route } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { camaraQueEnsena, QR_E2E } from './camara-falsa';

// La instructora escanea el QR de una alumna desde «Pasar lista» (control de
// acceso con QR, 28-sep). De punta a punta en el navegador: la cámara (simulada)
// enseña un QR real, el lector lo lee, el servidor (mockeado) contesta con la
// reserva de verdad, y la fila de la lista pasa a «Ha venido».
//
// ⚠️ Cada camino lleva contador de peticiones: «no marcó» también sería verdad si
// la pantalla no hubiera llegado a mandar nada (.claude/tentare-os.md).

const INSTRUCTORA = { instructorId: 'ins-1', nombre: 'Ana Ferrer', fotoUrl: null };
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** La clase de ahora: empezó hace 5 minutos. */
function claseDeAhora() {
  const inicioMs = Date.now() - 5 * 60_000;
  const inicio = new Date(inicioMs).toISOString();
  const fin = new Date(inicioMs + 55 * 60_000).toISOString();
  return {
    id: 'ses-ana', tipo: 'Reformer Flow', cancelada: false, inicio, fin,
    fecha: fmtDia.format(new Date(inicio)), hora: fmtHora.format(new Date(inicio)), horaFin: fmtHora.format(new Date(fin)),
  };
}

function respuesta(p: Record<string, unknown>) {
  return {
    escaneoId: 7, alumna: { nombre: 'Aina P.', foto: null }, clase: null, otraClase: null, candidatas: [],
    tipoAcceso: 'RESERVA', plazaFija: null, estadoReserva: 'CONFIRMADA', reservaId: 'r1', avisos: [], yaEntroEn: null,
    asistenciaMarcada: false, asistenciaAlTerminar: false, errorAsistencia: null, puerta: 'sin-kisi', acciones: [],
    claseEmpezada: true, ...p,
  };
}

async function montar(page: Page, escaneo: (cuerpo: Record<string, unknown>) => { status: number; body: unknown }) {
  const contador = { escanear: [] as Record<string, unknown>[], decidir: [] as Record<string, unknown>[] };
  await camaraQueEnsena(page, QR_E2E);
  await montarPortal(page, { conSesion: true, sinSocia: true });
  await page.route('**/api/public/session**', (route) => json(route, { error: 'No hay ninguna socia' }, 404));
  await page.route('**/api/portal/instructora/sesion', (route) => json(route, { instructora: INSTRUCTORA }));
  await page.route('**/api/portal/instructora/agenda', (route) => json(route, { clases: [], bajas: [] }));
  await page.route('**/api/portal/instructora/lista', (route) => json(route, {
    clase: claseDeAhora(),
    alumnas: [
      { reservaId: 'r1', nombre: 'Aina P.', estado: 'por-marcar' },
      { reservaId: 'r2', nombre: 'Laura M.', estado: 'por-marcar' },
    ],
  }));
  await page.route('**/api/portal/instructora/escanear', (route) => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    if (cuerpo.accion === 'decidir') {
      contador.decidir.push(cuerpo);
      return json(route, { escaneoId: 8, veredicto: 'PERMITIDO', motivo: 'RESERVA_CONFIRMADA', asistenciaMarcada: true, asistenciaAlTerminar: false, errorAsistencia: null, puerta: 'sin-kisi' });
    }
    contador.escanear.push(cuerpo);
    const r = escaneo(cuerpo);
    return json(route, r.body, r.status);
  });
  return contador;
}

const fila = (page: Page, nombre: string) => page.getByTestId('alumna-en-lista').filter({ hasText: nombre });
const cerrarEscaner = (page: Page) => page.getByRole('dialog', { name: 'Escanear QR' }).getByRole('button', { name: 'Cerrar' }).click();

test.describe('La instructora escanea el QR desde «Pasar lista»', () => {
  test.describe.configure({ timeout: 120_000 });

  test('🟢 lee el QR, manda SU clase y la fila pasa a «Ha venido» con lo que confirma el servidor', async ({ page }) => {
    const contador = await montar(page, () => ({ status: 200, body: respuesta({ veredicto: 'PERMITIDO', motivo: 'RESERVA_CONFIRMADA', asistenciaMarcada: true, estadoReserva: 'ASISTIDA' }) }));
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);
    await expect(fila(page, 'Aina P.')).toContainText('Por marcar', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Escanear QR' }).click();
    await page.getByRole('button', { name: 'Encender la cámara' }).click();

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'PERMITIDO', { timeout: 30_000 });
    await expect(resultado).toContainText('Acceso permitido');
    await expect(resultado).toContainText('Reserva confirmada.');
    expect(contador.escanear.length).toBeGreaterThan(0);
    expect(contador.escanear[0]).toMatchObject({ slug: SLUG, sesionId: 'ses-ana', accion: 'escanear', lectura: QR_E2E });

    await cerrarEscaner(page);
    await expect(fila(page, 'Aina P.')).toContainText('Ha venido');
    await expect(fila(page, 'Laura M.')).toContainText('Por marcar');
  });

  test('🔴 sin reserva: lo dice y la lista no cambia', async ({ page }) => {
    const contador = await montar(page, () => ({ status: 200, body: respuesta({ veredicto: 'DENEGADO', motivo: 'SIN_RESERVA', estadoReserva: null, reservaId: null, tipoAcceso: null, clase: { id: 'ses-ana', inicio: '', fin: '', cancelada: false, nombre: 'Reformer Flow', sala: null, instructora: null } }) }));
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);
    await page.getByRole('button', { name: 'Escanear QR' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Encender la cámara' }).click();

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'DENEGADO', { timeout: 30_000 });
    await expect(resultado).toContainText('No tiene una reserva para esta clase.');
    expect(contador.escanear.length).toBeGreaterThan(0);

    await cerrarEscaner(page);
    await expect(fila(page, 'Aina P.')).toContainText('Por marcar');
  });

  test('🟠 estado a revisar: sin datos de dinero; «Dejar pasar» decide en el servidor y marca', async ({ page }) => {
    const contador = await montar(page, () => ({ status: 200, body: respuesta({ veredicto: 'REVISAR', motivo: 'ESTADO_A_REVISAR', acciones: ['DEJAR_PASAR', 'NO_PERMITIR'] }) }));
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);
    await page.getByRole('button', { name: 'Escanear QR' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Encender la cámara' }).click();

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'REVISAR', { timeout: 30_000 });
    await expect(resultado).toContainText('Esta alumna tiene un estado que requiere revisión.');
    await expect(resultado).not.toContainText(/impag|recibo/i);

    await resultado.getByRole('button', { name: 'Dejar pasar' }).click();
    await expect(resultado).toHaveAttribute('data-veredicto', 'PERMITIDO', { timeout: 15_000 });
    expect(contador.decidir).toHaveLength(1);
    expect(contador.decidir[0]).toMatchObject({ accion: 'decidir', escaneoId: 7, decision: 'DEJAR_PASAR', sesionId: 'ses-ana' });

    await cerrarEscaner(page);
    await expect(fila(page, 'Aina P.')).toContainText('Ha venido');
  });

  test('si el servidor falla, lo explica, no marca a nadie (y lo intentó de verdad)', async ({ page }) => {
    const contador = await montar(page, () => ({ status: 500, body: { error: 'No hemos podido leer el QR.' } }));
    await page.goto(`/portal/${SLUG}/equipo/clase/ses-ana/lista`);
    await page.getByRole('button', { name: 'Escanear QR' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Encender la cámara' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido leer el QR.' })).toBeVisible({ timeout: 30_000 });
    expect(contador.escanear.length).toBeGreaterThan(0);
    await expect(page.getByTestId('resultado-acceso')).toHaveCount(0);

    await cerrarEscaner(page);
    await expect(fila(page, 'Aina P.')).toContainText('Por marcar');
  });
});
