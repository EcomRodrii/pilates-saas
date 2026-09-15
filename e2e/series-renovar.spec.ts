import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Una clase que se repite y se acaba aparece en Inicio para renovarla.
//
// Antes una serie terminaba en silencio: el calendario se quedaba vacío en ese
// hueco y nadie avisaba. Qué se crea y qué no lo decide el servidor
// (`/api/series/renovar`, que simula con la misma función que renueva): la
// pantalla repite lo que dice, y renovar manda el período que se ha revisado.
// Cada camino de fallo lleva contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

// Sala y tipo de clase del panel sembrado.
const SERIE = {
  serieId: 'serie-e2e', ultimaFecha: '2026-10-06', diaSemana: 2, hora: '18:00', salaId: 'sala-1',
  tipoClaseId: 'tc-reformer', instructorId: 'ins-marta', aforo: 6, periodo: 1, semanasPeriodo: 52,
  plazasFijas: 3, terminada: false,
};
const NOMBRE = 'Reformer · Martes 18:00 · Sala Reformer';
const SIMULACION = {
  estado: 'simulacion', periodo: 2, periodoActual: 1, semanas: 52, desde: '2026-10-13', hasta: '2027-10-05',
  creadas: 51, omitidas: [{ fecha: '2026-12-22', motivo: 'sala_ocupada' }], sinInstructora: [],
  instructoraInactiva: false, plazasFijas: 3,
};
const ESTADO = {
  aplica: true, enMarcha: [], resuelto: [], nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
  decidir: [{ id: 'seriesPorRenovar', n: 1, texto: 'Una clase que se repite está a punto de terminar', href: null }],
};

type Accion = 'simular' | 'renovar' | 'no_renovar' | 'automatica';
type Respuesta = { status?: number; body: unknown };

async function abrirInicio(page: Page, respuestas: Partial<Record<Accion, Respuesta>>) {
  await montar(page);
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  await page.route('**/api/estado-estudio', r => json(r, ESTADO));
  const envios: Record<string, unknown>[] = [];
  await page.route('**/api/series/renovar', r => {
    if (r.request().method() === 'GET') return json(r, { ok: true, series: [SERIE] });
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    envios.push(cuerpo);
    const resp = respuestas[cuerpo.accion as Accion] ?? { status: 500, body: { error: 'Acción no esperada en el test' } };
    return json(r, resp.body, resp.status ?? 200);
  });

  await ir(page, 'dashboard');
  await expect(page.getByTestId('serie-por-renovar')).toBeVisible({ timeout: 60_000 });
  return { envios };
}

test.describe('Inicio · clases que se repiten y se acaban', () => {
  test.describe.configure({ timeout: 180_000 });

  test('revisar enseña lo que pasará y renovar manda el período revisado', async ({ page }) => {
    const { envios } = await abrirInicio(page, {
      simular: { body: { ok: true, resultado: SIMULACION } },
      renovar: { body: { ok: true, resultado: { ...SIMULACION, estado: 'renovada' } } },
    });
    const fila = page.getByTestId('serie-por-renovar');
    await expect(fila.getByText(NOMBRE)).toBeVisible();
    await expect(fila.getByText(/3 alumnas con plaza fija/)).toBeVisible();

    await page.getByRole('button', { name: `Revisar y renovar ${NOMBRE}` }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('Se crean 51 clases.')).toBeVisible();
    await expect(dialogo.getByText(/Las 3 plazas fijas de este horario siguen/)).toBeVisible();
    await expect(dialogo.getByText('22/12/2026: la sala está ocupada a esa hora')).toBeVisible();
    await expect(dialogo.getByLabel('Semanas más')).toHaveValue('52');
    // Revisar no crea nada: solo simula, con las semanas del último período.
    const simulaciones = envios.filter(e => e.accion === 'simular');
    expect(simulaciones.length).toBeGreaterThan(0);
    expect(simulaciones.every(e => e.serieId === 'serie-e2e' && e.semanas === null)).toBe(true);
    expect(envios.some(e => e.accion === 'renovar')).toBe(false);

    await dialogo.getByRole('button', { name: 'Renovar 52 semanas' }).click();
    await expect(dialogo).toBeHidden();
    expect(envios.filter(e => e.accion === 'renovar')).toEqual([
      { serieId: 'serie-e2e', accion: 'renovar', semanas: 52, periodoVisto: 1 },
    ]);
    await expect(page.getByText(/Clase renovada: 51 clases más, hasta el 05\/10\/2027/)).toBeVisible();
    await expect(page.getByTestId('serie-por-renovar')).toHaveCount(0);
  });

  test('si el servidor dice que no, el diálogo enseña el motivo y la clase sigue en la lista', async ({ page }) => {
    const { envios } = await abrirInicio(page, {
      simular: { body: { ok: true, resultado: SIMULACION } },
      renovar: { status: 400, body: { error: 'Todas las clases de esta serie están canceladas: no hay nada que renovar.' } },
    });
    await page.getByRole('button', { name: `Revisar y renovar ${NOMBRE}` }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByRole('button', { name: 'Renovar 52 semanas' }).click();

    await expect(dialogo.getByText('Todas las clases de esta serie están canceladas: no hay nada que renovar.')).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(envios.filter(e => e.accion === 'renovar').length).toBeGreaterThan(0);
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('serie-por-renovar')).toBeVisible();
  });

  test('«No renovar» la quita de la lista y lo guarda en el servidor', async ({ page }) => {
    const { envios } = await abrirInicio(page, { no_renovar: { body: { ok: true } } });
    await page.getByRole('button', { name: `No renovar ${NOMBRE}` }).click();

    await expect(page.getByText(/No te lo volveremos a recordar/)).toBeVisible();
    expect(envios).toEqual([{ serieId: 'serie-e2e', accion: 'no_renovar' }]);
    await expect(page.getByTestId('serie-por-renovar')).toHaveCount(0);
  });

  test('«Renovar sola» se guarda en el servidor al marcarla', async ({ page }) => {
    const { envios } = await abrirInicio(page, {
      simular: { body: { ok: true, resultado: SIMULACION } },
      automatica: { body: { ok: true } },
    });
    await page.getByRole('button', { name: `Revisar y renovar ${NOMBRE}` }).click();
    const dialogo = page.getByRole('dialog');
    const check = dialogo.getByRole('checkbox', { name: /Renovar sola cuando se vaya a acabar/ });
    await expect(check).not.toBeChecked();
    await check.click();

    await expect(check).toBeChecked();
    expect(envios.filter(e => e.accion === 'automatica')).toEqual([{ serieId: 'serie-e2e', accion: 'automatica', activar: true }]);
    // Marcarla no renueva nada por sí sola.
    expect(envios.some(e => e.accion === 'renovar')).toBe(false);
  });

  test('si no se puede guardar «Renovar sola», no se queda marcada y dice por qué', async ({ page }) => {
    const { envios } = await abrirInicio(page, {
      simular: { body: { ok: true, resultado: SIMULACION } },
      automatica: { status: 500, body: { error: 'No se ha podido guardar.' } },
    });
    await page.getByRole('button', { name: `Revisar y renovar ${NOMBRE}` }).click();
    const dialogo = page.getByRole('dialog');
    const check = dialogo.getByRole('checkbox', { name: /Renovar sola cuando se vaya a acabar/ });
    await check.click();

    await expect(dialogo.getByText('No se ha podido guardar.')).toBeVisible();
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(envios.filter(e => e.accion === 'automatica').length).toBeGreaterThan(0);
    await expect(check).not.toBeChecked();
  });
});
