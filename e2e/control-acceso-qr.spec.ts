import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { camaraQueEnsena, QR_E2E } from './camara-falsa';

// Control de acceso del panel (/calendario/pase), de punta a punta en el
// navegador: la cámara (simulada) enseña un QR real, el lector lo lee y la
// tarjeta cuenta lo que contesta el servidor (mockeado).
//
// ⚠️ Cada camino lleva contador de peticiones (.claude/tentare-os.md).

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const REFORMER = { id: 'ses-1', inicio: '2026-09-29T16:00:00Z', fin: '2026-09-29T16:55:00Z', cancelada: false, nombre: 'Reformer', sala: 'Sala 2', instructora: 'Laura' };

function respuesta(p: Record<string, unknown>) {
  return {
    escaneoId: 11, alumna: { nombre: 'María García', foto: null }, clase: REFORMER, otraClase: null, candidatas: [],
    tipoAcceso: 'RESERVA', plazaFija: null, estadoReserva: 'CONFIRMADA', reservaId: 'res-1', avisos: [], yaEntroEn: null,
    asistenciaMarcada: false, asistenciaAlTerminar: false, errorAsistencia: null, puerta: 'sin-kisi', acciones: [],
    claseEmpezada: false, ...p,
  };
}

const FILA_HISTORIAL = {
  id: 90, ocurridoEn: '2026-09-29T15:52:00Z', resultado: 'DENEGADO', motivo: 'RESERVA_CANCELADA', decision: null,
  origen: 'APP_INSTRUCTORA', asistenciaMarcada: false, alumna: { id: 'soc-2', nombre: 'Laura Martín' },
  clase: { nombre: 'Reformer', inicio: '2026-09-29T16:00:00Z', sala: 'Sala 2' }, quien: 'Marta Ruiz',
};

async function montarLector(page: Page, escaneo: { status: number; body: unknown }) {
  const contador = { escanear: [] as Record<string, unknown>[], decidir: [] as Record<string, unknown>[], puerta: 0, historial: [] as string[] };
  await montar(page);
  await camaraQueEnsena(page, QR_E2E);
  // Después del andamiaje: en Playwright gana la última ruta registrada.
  await page.route((u) => u.pathname === '/api/acceso/escanear', (route) => {
    if (route.request().method() === 'GET') return json(route, { clases: [REFORMER] });
    contador.escanear.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, escaneo.body, escaneo.status);
  });
  await page.route((u) => u.pathname === '/api/acceso/decidir', (route) => {
    contador.decidir.push(JSON.parse(route.request().postData() || '{}'));
    return json(route, { escaneoId: 12, veredicto: 'PERMITIDO', motivo: 'RESERVA_CONFIRMADA', asistenciaMarcada: true, asistenciaAlTerminar: false, errorAsistencia: null, puerta: 'disponible' });
  });
  await page.route((u) => u.pathname === '/api/acceso/puerta', (route) => {
    contador.puerta++;
    return json(route, { puerta: 'abierta' });
  });
  await page.route((u) => u.pathname === '/api/acceso/historial', (route) => {
    contador.historial.push(new URL(route.request().url()).search);
    return json(route, { filas: [FILA_HISTORIAL] });
  });
  return contador;
}

async function escanear(page: Page) {
  await ir(page, 'calendario/pase');
  await page.getByRole('button', { name: 'Encender la cámara' }).click({ timeout: 30_000 });
}

test.describe('Control de acceso con QR en el panel', () => {
  test.describe.configure({ timeout: 120_000 });

  test('🟢 lee el QR contra «todas las de ahora» y enseña alumna, clase y estado', async ({ page }) => {
    const contador = await montarLector(page, { status: 200, body: respuesta({ veredicto: 'PERMITIDO', motivo: 'RESERVA_CONFIRMADA', asistenciaMarcada: true, estadoReserva: 'ASISTIDA' }) });
    await escanear(page);

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'PERMITIDO', { timeout: 30_000 });
    await expect(resultado).toContainText('Acceso permitido');
    await expect(resultado).toContainText('María García');
    await expect(resultado).toContainText('Reformer');
    await expect(resultado).toContainText('Asistencia registrada.');
    expect(contador.escanear.length).toBeGreaterThan(0);
    expect(contador.escanear[0]).toMatchObject({ lectura: QR_E2E, sesionId: null });
  });

  test('🟠 pendiente de aprobación: «Aprobar y dejar pasar» decide en el servidor; con Kisi, la puerta espera al botón', async ({ page }) => {
    const contador = await montarLector(page, { status: 200, body: respuesta({ veredicto: 'REVISAR', motivo: 'PENDIENTE_APROBACION', estadoReserva: 'PENDIENTE_APROBACION', acciones: ['APROBAR', 'NO_PERMITIR'] }) });
    await escanear(page);

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'REVISAR', { timeout: 30_000 });
    await expect(resultado).toContainText('Esta reserva está pendiente de aprobación.');
    await resultado.getByRole('button', { name: 'Aprobar y dejar pasar' }).click();

    await expect(resultado).toHaveAttribute('data-veredicto', 'PERMITIDO', { timeout: 15_000 });
    expect(contador.decidir).toEqual([{ escaneoId: 11, decision: 'APROBAR' }]);
    // La puerta no se ha abierto sola: espera a que alguien pulse.
    expect(contador.puerta).toBe(0);
    await resultado.getByRole('button', { name: 'Abrir la puerta' }).click();
    await expect(resultado).toContainText('Puerta abierta', { timeout: 15_000 });
    expect(contador.puerta).toBe(1);
  });

  test('🔴 reserva cancelada: lo dice con el motivo, sin acciones', async ({ page }) => {
    const contador = await montarLector(page, { status: 200, body: respuesta({ veredicto: 'DENEGADO', motivo: 'RESERVA_CANCELADA', estadoReserva: 'CANCELADA', tipoAcceso: null }) });
    await escanear(page);

    const resultado = page.getByTestId('resultado-acceso');
    await expect(resultado).toHaveAttribute('data-veredicto', 'DENEGADO', { timeout: 30_000 });
    await expect(resultado).toContainText('Acceso denegado');
    await expect(resultado).toContainText('Esta reserva fue cancelada.');
    await expect(resultado.getByRole('button', { name: /Aprobar|Dejar pasar/ })).toHaveCount(0);
    expect(contador.escanear.length).toBeGreaterThan(0);
  });

  test('si el servidor falla, lo explica y no pinta ningún resultado (y lo intentó de verdad)', async ({ page }) => {
    const contador = await montarLector(page, { status: 500, body: { error: 'No hemos podido leer el QR.' } });
    await escanear(page);

    await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido leer el QR.' })).toBeVisible({ timeout: 30_000 });
    expect(contador.escanear.length).toBeGreaterThan(0);
    await expect(page.getByTestId('resultado-acceso')).toHaveCount(0);
  });
});

test.describe('Historial de accesos y QR de una alumna en el panel', () => {
  test.describe.configure({ timeout: 120_000 });

  test('el historial del día dice quién intentó entrar, qué pasó y quién escaneó, y se refresca tras cada escaneo', async ({ page }) => {
    const contador = await montarLector(page, { status: 200, body: respuesta({ veredicto: 'PERMITIDO', motivo: 'RESERVA_CONFIRMADA', asistenciaMarcada: true }) });
    await ir(page, 'calendario/pase');

    const historial = page.getByTestId('historial-accesos');
    await expect(historial).toContainText('Laura Martín', { timeout: 30_000 });
    await expect(historial).toContainText('Reserva cancelada');
    await expect(historial).toContainText('Escaneó Marta Ruiz · desde su app');
    expect(contador.historial[0]).toMatch(/^\?dia=\d{4}-\d{2}-\d{2}$/);
    const antes = contador.historial.length;

    await page.getByRole('button', { name: 'Encender la cámara' }).click();
    await expect(page.getByTestId('resultado-acceso')).toHaveAttribute('data-veredicto', 'PERMITIDO', { timeout: 30_000 });
    await expect.poll(() => contador.historial.length, { timeout: 15_000 }).toBeGreaterThan(antes);
  });

  test('ficha: «Generar QR nuevo» no anuncia nada si el servidor dice que no, y avisa de que el anterior ya no vale cuando sí', async ({ page }) => {
    await montar(page);
    const regenerar: Record<string, unknown>[] = [];
    await page.route((u) => u.pathname === '/api/acceso/historial', (route) => json(route, { filas: [{ ...FILA_HISTORIAL, alumna: { id: 'soc-1', nombre: 'María García Fernández' }, resultado: 'PERMITIDO', motivo: 'PLAZA_FIJA', origen: 'PANEL', quien: 'Ana Peña', asistenciaMarcada: true }] }));
    await page.route((u) => u.pathname === '/api/acceso/qr-alumna', (route) => {
      if (route.request().method() === 'GET') return json(route, { controlActivo: true, qrDesde: '2026-09-20T10:00:00Z' });
      regenerar.push(JSON.parse(route.request().postData() || '{}'));
      return regenerar.length === 1
        ? json(route, { error: 'No hemos podido generar el QR nuevo.' }, 500)
        : json(route, { qrDesde: '2026-09-28T10:00:00Z' });
    });
    await ir(page, 'clientas/soc-1');
    await page.getByRole('tab', { name: 'Reservas', exact: true }).click();

    const bloque = page.getByTestId('accesos-clienta');
    await expect(bloque).toContainText('Su QR vale desde el 20 de septiembre', { timeout: 30_000 });
    await expect(bloque.getByTestId('historial-accesos')).toContainText('Plaza fija');
    await expect(bloque.getByTestId('historial-accesos')).toContainText('asistencia marcada');

    const pedir = async () => {
      await bloque.getByRole('button', { name: 'Generar QR nuevo' }).click();
      await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: 'Generar QR nuevo' }).click();
    };
    await pedir();
    await expect(bloque.getByRole('alert')).toContainText('No hemos podido generar el QR nuevo.', { timeout: 15_000 });
    expect(regenerar).toEqual([{ socioId: 'soc-1' }]);
    await expect(bloque).not.toContainText('ya no funciona');

    await pedir();
    await expect(bloque.getByRole('status')).toContainText('Hecho: su QR anterior ya no funciona.', { timeout: 15_000 });
    expect(regenerar).toHaveLength(2);
    await expect(bloque).toContainText('Su QR vale desde el 28 de septiembre');
  });
});
