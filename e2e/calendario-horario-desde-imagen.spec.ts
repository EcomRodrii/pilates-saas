import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Calendario › Importar › «Desde una captura o un texto» (P2.1), apagado tras
// `HORARIO_DESDE_IMAGEN`. Se lee (la lectura la hace el servidor con IA: aquí
// va mockeada), se REVISA en una tabla y solo el botón crea, con el importador
// de siempre: clases semanales desde el lunes que dice el servidor, con
// `origen: 'imagen'`. Con contadores: «no creó nada» tiene que ser porque no se
// intentó, y en los fallos, que sí se intentó.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

/** El lunes siguiente a hoy (día de Madrid), como lo calcula el servidor. */
function proximoLunes(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const d = new Date(`${hoy}T12:00:00Z`);
  const hasta = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + hasta);
  return d.toISOString().slice(0, 10);
}

const LECTURA = () => ({
  resultado: 'HORARIO',
  filas: [
    { dia: 'lunes', inicio: '09:00', fin: '09:50', clase: 'Reformer', instructora: 'Ana', sala: 'Sala 1', aforo: 8, dudosa: false },
    { dia: 'miercoles', inicio: '19:00', fin: '19:50', clase: 'Mat', instructora: 'Zoe Inventada', sala: null, aforo: null, dudosa: true },
  ],
  descartadas: 1,
  avisos: ['La columna del sábado está cortada'],
  desde: proximoLunes(),
});

// Un PNG de 1×1 de verdad: el navegador lo abre y lo reduce antes de enviarlo.
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function montarCon(page: Page, o: {
  encendido: boolean;
  leer?: { status: number; body: unknown };
  importar?: { status: number; body: unknown };
}) {
  await montar(page);
  const lecturas: { tipo: string; cuerpo: string }[] = [];
  const importaciones: unknown[] = [];
  // ⚠️ Después de `montar()`: gana la ruta registrada más tarde.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) =>
    json(r, { filtrosClientas: false, horarioDesdeImagen: o.encendido }));
  await page.route((u) => u.pathname === '/api/horario/leer', (r) => {
    lecturas.push({ tipo: r.request().headers()['content-type'] ?? '', cuerpo: r.request().postDataBuffer()?.toString('latin1') ?? '' });
    const res = o.leer ?? { status: 200, body: LECTURA() };
    return json(r, res.body, res.status);
  });
  await page.route((u) => u.pathname === '/api/clases/import', (r) => {
    importaciones.push(r.request().postDataJSON());
    const res = o.importar ?? { status: 200, body: { ok: true, creadas: 24, omitidas: 0, tiposCreados: 1, sinInstructor: 0, sinSala: 0, errores: [], instructorasCreadas: [] } };
    return json(r, res.body, res.status);
  });
  await ir(page, 'calendario/importar');
  await expect(page.getByRole('heading', { name: 'Importar horario' })).toBeVisible({ timeout: 60_000 });
  return { lecturas, importaciones };
}

const ENTRADA = /Desde una captura o un texto/;

test('apagado: la pantalla es la de siempre y no se lee nada', async ({ page }) => {
  const { lecturas } = await montarCon(page, { encendido: false });
  await expect(page.getByText('Arrastra tu archivo CSV o Excel aquí')).toBeVisible();
  await expect(page.getByRole('button', { name: ENTRADA })).toHaveCount(0);
  expect(lecturas).toHaveLength(0);
});

test('encendido: se lee el texto, se revisa en la tabla y solo el botón crea, desde el lunes que dice el servidor', async ({ page }) => {
  const { lecturas, importaciones } = await montarCon(page, { encendido: true });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('Lunes 9:00 Reformer con Ana\nMiércoles 19:00 Mat');
  await page.getByRole('button', { name: 'Leer el texto' }).click();

  const tabla = page.getByTestId('horario-leido');
  await expect(tabla).toBeVisible({ timeout: 20_000 });
  expect(lecturas).toHaveLength(1);
  expect(lecturas[0].cuerpo).toContain('name="texto"');
  await expect(tabla.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText(/no las hemos leído seguras/)).toBeVisible();
  await expect(page.getByText('La columna del sábado está cortada')).toBeVisible();
  await expect(page.getByText(/Una clase no se ha podido leer/)).toBeVisible();
  // «Ana» es la Ana Peña del equipo; «Zoe Inventada» se daría de alta: se avisa en su fila.
  await expect(tabla.locator('tbody tr').nth(0).getByText('nueva', { exact: true })).toHaveCount(0);
  await expect(tabla.locator('tbody tr').nth(1).getByText('nueva', { exact: true })).toBeVisible();
  await expect(page.getByTestId('horario-resumen')).toContainText('como mucho 24 clases hasta el');
  // Nada creado todavía.
  expect(importaciones).toHaveLength(0);

  // Se corrige una fila y se crea.
  await page.getByLabel('Clase de la fila 2').fill('Mat Intermedio');
  await expect(page.getByTestId('horario-resumen')).toContainText('2 clases semanales');
  await page.getByRole('button', { name: 'Crear 2 clases semanales' }).click();

  await expect(page.getByText('Horario creado')).toBeVisible({ timeout: 20_000 });
  expect(importaciones).toHaveLength(1);
  const cuerpo = importaciones[0] as { origen: string; semanas: number; desde: string; rows: { clase: string; diaSemana: number; fecha: unknown }[] };
  expect(cuerpo.origen).toBe('imagen');
  expect(cuerpo.semanas).toBe(12);
  expect(cuerpo.desde).toBe(proximoLunes());
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  expect(cuerpo.desde > hoy).toBe(true);
  expect(cuerpo.rows.map((f) => [f.clase, f.diaSemana, f.fecha])).toEqual([['Reformer', 1, null], ['Mat Intermedio', 3, null]]);
});

test('una captura se reduce en el navegador y va como imagen', async ({ page }) => {
  const { lecturas } = await montarCon(page, { encendido: true });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('Captura del horario').setInputFiles({ name: 'horario.png', mimeType: 'image/png', buffer: PNG_1x1 });
  await expect(page.getByTestId('horario-leido')).toBeVisible({ timeout: 20_000 });
  expect(lecturas).toHaveLength(1);
  expect(lecturas[0].tipo).toContain('multipart/form-data');
  expect(lecturas[0].cuerpo).toContain('name="imagen"');
  expect(lecturas[0].cuerpo).toContain('Content-Type: image/jpeg');
});

test('si no se puede leer, se dice en rojo y no se crea nada (y sí se intentó leer)', async ({ page }) => {
  const { lecturas, importaciones } = await montarCon(page, {
    encendido: true, leer: { status: 422, body: { error: 'No hemos podido leer el horario. Prueba con una captura más nítida, o pega el texto.' } },
  });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('algo');
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  await expect.poll(() => lecturas.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido leer el horario' })).toBeVisible();
  await expect(page.getByTestId('horario-leido')).toHaveCount(0);
  expect(importaciones).toHaveLength(0);
});

test('si el tope del día está lleno, se dice (y sí se intentó)', async ({ page }) => {
  const { lecturas } = await montarCon(page, {
    encendido: true, leer: { status: 429, body: { error: 'Hoy ya se han leído 10 horarios en tu estudio. Vuelve mañana, o súbelo en Excel.', codigo: 'TOPE_DIARIO' } },
  });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('algo');
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hoy ya se han leído 10 horarios' })).toBeVisible({ timeout: 20_000 });
  expect(lecturas.length).toBeGreaterThan(0);
});

test('si crear falla, la tabla sigue ahí con el motivo (y sí se intentó)', async ({ page }) => {
  const { importaciones } = await montarCon(page, {
    encendido: true, importar: { status: 500, body: { error: 'No se pudo leer la base de datos' } },
  });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('Lunes 9:00 Reformer');
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  await page.getByRole('button', { name: 'Crear 2 clases semanales' }).click({ timeout: 20_000 });
  await expect.poll(() => importaciones.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo leer la base de datos' })).toBeVisible();
  await expect(page.getByTestId('horario-leido')).toBeVisible();
  await expect(page.getByText('Horario creado')).toHaveCount(0);
});

test('lo que no es un horario, la red caída o una imagen que no se abre: se dice, y sin crear nada', async ({ page }) => {
  const { lecturas, importaciones } = await montarCon(page, {
    encendido: true, leer: { status: 200, body: { resultado: 'NO_ES_HORARIO', filas: [], descartadas: 0, avisos: [], desde: proximoLunes() } },
  });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('una receta de cocina');
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Eso no parece un horario de clases' })).toBeVisible({ timeout: 20_000 });
  expect(lecturas).toHaveLength(1);

  // Una «imagen» que el navegador no sabe abrir no llega a enviarse.
  await page.getByLabel('Captura del horario').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('esto no es una imagen') });
  await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido abrir esa imagen aquí' })).toBeVisible({ timeout: 20_000 });
  expect(lecturas).toHaveLength(1);

  // Sin red.
  await page.route((u) => u.pathname === '/api/horario/leer', (r) => { lecturas.push({ tipo: '', cuerpo: '' }); return r.abort(); });
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido conectar' })).toBeVisible({ timeout: 20_000 });
  expect(lecturas.length).toBeGreaterThan(1);
  expect(importaciones).toHaveLength(0);
});

test('editar la tabla: una fila que no vale no se crea, quitar y añadir, «Está bien» y volver con confirmación', async ({ page }) => {
  const { importaciones } = await montarCon(page, { encendido: true });
  await page.getByRole('button', { name: ENTRADA }).click();
  await page.getByLabel('O pega el texto del horario').fill('Lunes 9:00 Reformer');
  await page.getByRole('button', { name: 'Leer el texto' }).click();
  const tabla = page.getByTestId('horario-leido');
  await expect(tabla).toBeVisible({ timeout: 20_000 });

  // Un fin antes del inicio: la fila no cuenta y se dice en rojo.
  await page.getByLabel('Hora de fin de la fila 1').fill('08:00');
  await expect(page.getByLabel('Hora de fin de la fila 1')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Crear 1 clase semanal' })).toBeVisible();
  await expect(page.getByTestId('horario-resumen')).toContainText('Una fila no está completa');

  // «Está bien» quita la marca de revisar (y editar, no).
  await expect(page.getByRole('button', { name: 'Revisar la fila 2: está bien' })).toBeVisible();
  await page.getByLabel('Instructora de la fila 2').fill('Marta Ruiz');
  await expect(page.getByRole('button', { name: 'Revisar la fila 2: está bien' })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar la fila 2: está bien' }).click();
  await expect(page.getByRole('button', { name: 'Revisar la fila 2: está bien' })).toHaveCount(0);

  // Quitar y añadir.
  await page.getByRole('button', { name: 'Quitar la fila 1' }).click();
  await expect(tabla.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Añadir una clase' }).click();
  await expect(tabla.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Crear 1 clase semanal' })).toBeVisible();
  await page.getByLabel('Clase de la fila 2').fill('Barre');
  await expect(page.getByRole('button', { name: 'Crear 2 clases semanales' })).toBeVisible();

  // Volver tras editar pide confirmación; seguir revisando no pierde nada.
  await page.getByRole('button', { name: 'Volver a subir o pegar' }).click();
  await expect(page.getByText('Se perderán los cambios de la tabla')).toBeVisible();
  await page.getByRole('button', { name: 'Seguir revisando' }).click();
  await expect(tabla.locator('tbody tr')).toHaveCount(2);
  expect(importaciones).toHaveLength(0);
});

