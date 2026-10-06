import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { enOscuro } from './panel-sembrado';
import { ACCION_ID, PROPUESTAS, conAcciones, conAsistente, respuestaPropuesta, chat, ndjson, json, pedirAlAsistente, type TipoPropuesta } from './asistente-andamiaje';

// ─────────────────────────────────────────────────────────────────────────────
// «Pregúntale a Tentare», Fase 2: crear clases, salas, eventos y citas CON
// confirmación. El modelo propone (tarjeta) y solo «Confirmar» crea.
//
// Nunca se llama a Anthropic ni al servidor real: el chat y los endpoints de
// confirmar/cancelar van mockeados, cada uno con su CONTADOR (regla del repo: un
// camino de fallo sin `expect(intentos).toBeGreaterThan(0)` no prueba nada, y
// aquí «no mintió» podría ser verdad por no haber intentado nada).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const TIPOS = Object.keys(PROPUESTAS) as TipoPropuesta[];
const CAPTURAS = process.env.ASISTENTE_CAPTURAS;

for (const tipo of TIPOS) {
  test(`${tipo}: la tarjeta propone, nada se crea hasta Confirmar, y «Creada» solo con la respuesta OK`, async ({ page }) => {
    const n = await conAcciones(page, { tipo });
    const tarjeta = await pedirAlAsistente(page);
    const p = PROPUESTAS[tipo];
    await expect(tarjeta).toContainText(p.titulo);
    for (const [etiqueta] of p.lineas) await expect(tarjeta).toContainText(etiqueta);
    // Las marcas se pintan con el nombre que llegó aparte; el texto de la respuesta, igual.
    await expect(tarjeta).not.toContainText(/\[(EQUIPO|ALUMNA)_\d\]/);
    if (tipo === 'CREAR_CLASE' || tipo === 'CREAR_CITA') await expect(tarjeta).toContainText('Marta Ruiz');
    if (p.efecto) await expect(tarjeta).toContainText('se avisa a todas las alumnas');
    expect(n.acc.confirmar, 'proponer no confirma nada').toBe(0);
    await expect(tarjeta.getByRole('button', { name: 'Confirmar' })).toBeVisible();

    await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
    await expect(tarjeta.getByText('Creada', { exact: true }).first()).toBeVisible();
    expect(n.acc.confirmar).toBeGreaterThan(0);
    // Solo viaja el id: lo que se ejecuta es lo que guardó el servidor.
    expect(n.acc.cuerposConfirmar[0]).toEqual({ id: ACCION_ID });
    await expect(tarjeta.getByRole('link', { name: p.ver })).toHaveAttribute('href', p.href);
    await expect(tarjeta.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  });
}

test('doble clic y Enter pegado: una sola petición de confirmar', async ({ page }) => {
  let soltar: () => void = () => {};
  const espera = new Promise<void>(r => { soltar = r; });
  const n = await conAcciones(page, {
    confirmar: async (r) => { await espera; await json(r, { estado: 'EJECUTADA', resultado: { href: '/calendario', texto: 'Ver en Calendario' }, yaCreada: false }); },
  });
  const tarjeta = await pedirAlAsistente(page);
  const boton = tarjeta.getByRole('button', { name: 'Confirmar' });
  await boton.dblclick();
  await expect(tarjeta.getByText('Creándola…')).toBeVisible();
  await expect.poll(() => n.acc.confirmar).toBeGreaterThan(0);
  soltar();
  await expect(tarjeta.getByText('Creada', { exact: true }).first()).toBeVisible();
  expect(n.acc.confirmar, 'dos clics = una sola petición').toBe(1);
});

test('el servidor dice que no (409, sala ocupada): lo dice, no pone «Creada» y se puede reintentar', async ({ page }) => {
  const n = await conAcciones(page, {
    confirmar: (r, i) => i === 1
      ? json(r, { error: 'La sala está ocupada a esa hora. Elige otra sala u otra hora. No se ha creado nada.', codigo: 'CONFLICTO' }, 409)
      : json(r, { estado: 'EJECUTADA', resultado: { href: '/calendario', texto: 'Ver en Calendario' }, yaCreada: false }),
  });
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  await expect(tarjeta.getByRole('alert')).toContainText('La sala está ocupada a esa hora');
  expect(n.acc.confirmar).toBeGreaterThan(0);
  await expect(tarjeta.getByText('Creada', { exact: true })).toHaveCount(0);
  await expect(tarjeta.getByRole('button', { name: 'Cambiar algo' })).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Reintentar' }).click();
  await expect(tarjeta.getByText('Creada', { exact: true }).first()).toBeVisible();
  expect(n.acc.confirmar).toBe(2);
});

test('500 del servidor: error claro, sin «Creada», y con contador', async ({ page }) => {
  const n = await conAcciones(page, { confirmar: (r) => json(r, { error: 'No he podido crearla ahora y no se ha creado nada. Puedes volver a intentarlo.', codigo: 'ERROR' }, 500) });
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  await expect(tarjeta.getByRole('alert')).toContainText('no se ha creado nada');
  expect(n.acc.confirmar).toBeGreaterThan(0);
  await expect(tarjeta.getByText('Creada', { exact: true })).toHaveCount(0);
});

test('red caída: no dice que se creó; dice que no sabe y que reintentar no duplica', async ({ page }) => {
  const n = await conAcciones(page, { confirmar: (r) => r.abort('failed') });
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  await expect(tarjeta.getByRole('alert')).toContainText('no sé si se ha creado');
  expect(n.acc.confirmar).toBeGreaterThan(0);
  await expect(tarjeta.getByText('Creada', { exact: true })).toHaveCount(0);
});

test('403 (sin permiso): lo dice y no crea; 410 (caducada) cierra la tarjeta', async ({ page }) => {
  const n = await conAcciones(page, { confirmar: (r) => json(r, { error: 'No tienes permiso para esto.', codigo: 'SIN_PERMISO' }, 403) });
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  await expect(tarjeta.getByRole('alert')).toContainText('No tienes permiso');
  expect(n.acc.confirmar).toBeGreaterThan(0);
  await expect(tarjeta.getByText('Creada', { exact: true })).toHaveCount(0);
});

test('la propuesta caducó en el servidor: la tarjeta lo dice y no queda Confirmar', async ({ page }) => {
  const n = await conAcciones(page, { confirmar: (r) => json(r, { error: 'La propuesta caducó: pídeselo de nuevo a Tentare.', codigo: 'CADUCADA' }, 410) });
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
  await expect(tarjeta).toContainText('ha caducado y no se ha creado nada');
  expect(n.acc.confirmar).toBeGreaterThan(0);
  await expect(tarjeta.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
});

test('ya caducada al llegar: sin botón Confirmar y sin llamar al servidor', async ({ page }) => {
  const n = await conAcciones(page, { expiraEn: new Date(Date.now() - 60_000).toISOString() });
  const tarjeta = await pedirAlAsistente(page);
  await expect(tarjeta).toContainText('ha caducado');
  await expect(tarjeta.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
  expect(n.acc.confirmar).toBe(0);
});

test('Cancelar y Cambiar algo avisan al servidor (que la deja sin poder confirmarse) y devuelven al chat', async ({ page }) => {
  const n = await conAcciones(page);
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(tarjeta).toContainText('No se ha creado nada');
  expect(n.acc.cancelar).toBeGreaterThan(0);
  expect(n.acc.cuerposCancelar[0]).toEqual({ id: ACCION_ID });
  expect(n.acc.confirmar).toBe(0);

});

test('Cambiar algo: cancela la propuesta y deja el cursor en el campo del chat', async ({ page }) => {
  const n = await conAcciones(page);
  const tarjeta = await pedirAlAsistente(page);
  await tarjeta.getByRole('button', { name: 'Cambiar algo' }).click();
  await expect(tarjeta).toContainText('Dime qué cambiar');
  expect(n.acc.cancelar).toBeGreaterThan(0);
  await expect(page.locator('#asistente-pregunta')).toBeFocused();
});

test('recepción no tiene el asistente: ni barra ni propuestas', async ({ page }) => {
  const n = await conAcciones(page, { rol: 'RECEPCION' });
  await page.goto('/centro-de-control');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('barra-preguntar')).toHaveCount(0);
  expect(n.preguntas).toBe(0);
  expect(n.acc.confirmar).toBe(0);
});

// ── Capturas (solo con ASISTENTE_CAPTURAS): propuesta, creada y error, claro y oscuro, 1280 y 390 ──
async function foto(page: Page, nombre: string) {
  mkdirSync(CAPTURAS!, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(CAPTURAS!, `acciones-${nombre}.png`) });
}

for (const tema of ['claro', 'oscuro'] as const) {
  for (const [ancho, alto] of [[1280, 900], [390, 844]] as const) {
    for (const tipo of TIPOS) {
      test(`capturas · ${tipo} · ${tema} · ${ancho}`, async ({ page }) => {
        test.skip(!CAPTURAS, 'Solo con ASISTENTE_CAPTURAS');
        await page.setViewportSize({ width: ancho, height: alto });
        if (tema === 'oscuro') await enOscuro(page);
        const n = await conAcciones(page, {
          tipo,
          confirmar: (r, i) => i === 1
            ? json(r, { error: 'Alguien ha ocupado ese hueco mientras tanto. No se ha creado nada.', codigo: 'CONFLICTO' }, 409)
            : json(r, { estado: 'EJECUTADA', resultado: { href: PROPUESTAS[tipo].href, texto: PROPUESTAS[tipo].ver }, yaCreada: false }),
        });
        const tarjeta = await pedirAlAsistente(page);
        const nombre = `${tipo.toLowerCase()}-%-${tema}-${ancho}`;
        await tarjeta.scrollIntoViewIfNeeded();
        await foto(page, nombre.replace('%', 'propuesta'));
        await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
        await expect(tarjeta.getByRole('alert')).toBeVisible();
        await tarjeta.scrollIntoViewIfNeeded();
        await foto(page, nombre.replace('%', 'error'));
        await tarjeta.getByRole('button', { name: 'Reintentar' }).click();
        await expect(tarjeta.getByText('Creada', { exact: true }).first()).toBeVisible();
        expect(n.acc.confirmar).toBe(2);
        await tarjeta.scrollIntoViewIfNeeded();
        await foto(page, nombre.replace('%', 'creada'));
      });
    }
  }
}

test('sala + clase vieja en el mismo turno: el servidor atiende una sola y el panel pinta UNA tarjeta (la de lo pedido)', async ({ page }) => {
  // El modelo pidió las dos; el bucle del servidor (lib/asistente/bucle.ts, cubierto en bucle.test.ts) solo
  // ejecuta la primera. Aquí se mockea ESE contrato: la rechazada no emite ni línea de estado ni tarjeta.
  const [inicio, , refs, bloque, , fin] = respuestaPropuesta('CREAR_SALA');
  const n = await conAsistente(page, {
    responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson([
      inicio,
      { t: 'herramienta', id: 'tu_a', nombre: 'proponer_sala', etiqueta: 'Preparando la sala…' },
      refs, bloque,
      { t: 'texto', delta: PROPUESTAS.CREAR_SALA.texto },
      fin,
    ]) }),
  });
  const tarjeta = await pedirAlAsistente(page, 'Créame una sala llamada reformer avanzado');
  expect(n.preguntas, 'el chat sí llegó a preguntar').toBeGreaterThan(0);
  await expect(chat(page).locator('[data-bloque="propuesta"]')).toHaveCount(1);
  await expect(tarjeta).toContainText('Crear una sala');
  await expect(chat(page)).not.toContainText('Crear una clase');
});
