import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Repetir este mes» en el Calendario (P1.7) con ConfirmarFechas (P2.3).
//
// Qué se crea lo decide el servidor (`/api/series/repetir-mes`, que simula y
// crea con `renovar_serie`): la pantalla enseña lo que propone, deja quitar
// clases y días, y manda SOLO lo marcado. El festivo viene sin marcar. Cada
// camino de fallo lleva contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// El mes que se ve al abrir (el de hoy en Madrid) y el siguiente: el test no caduca.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const [anio, mesNum] = hoy.split('-').map(Number);
const DESTINO = mesNum === 12 ? `${anio + 1}-01` : `${anio}-${String(mesNum + 1).padStart(2, '0')}`;
const NOMBRE_DESTINO = MESES[Number(DESTINO.slice(5)) - 1];
const d = (dia: number) => `${DESTINO}-${String(dia).padStart(2, '0')}`;

const serie = (o: Record<string, unknown>) => ({
  serieId: 'serie-a', periodoVisto: 1, tipoClaseId: 'tc-reformer', salaId: 'sala-1', dias: [2], hora: '18:30',
  fechas: [], bloqueadas: [], desmarcadaPor: null, error: null, sinInstructora: 0, instructoraInactiva: false, ...o,
});
const PROPUESTA = {
  mes: hoy.slice(0, 7), destino: DESTINO, hoy, zona: 'la Comunidad de Madrid',
  festivos: [{ fecha: d(8), nombre: 'Fiesta de prueba' }], abiertos: [], sueltas: 4, seriesFuera: 0, aniosSinFestivos: [],
  series: [
    serie({ serieId: 'serie-a', fechas: [d(1), d(8), d(15), d(22)] }),
    serie({ serieId: 'serie-b', dias: [4], fechas: [d(3), d(10), d(17), d(24)], bloqueadas: [{ fecha: d(24), motivo: 'sala_ocupada' }] }),
    serie({ serieId: 'serie-c', dias: [5], fechas: [d(4)], desmarcadaPor: 'no_renovar' }),
  ],
};

/** `texto`: el cuerpo no es JSON (un 504 de la plataforma al pasar del tiempo máximo). */
type Respuesta = { status?: number; body: unknown; texto?: string };

async function abrirCalendario(page: Page, o: { disponible?: unknown; crear?: Respuesta } = {}) {
  await montar(page);
  const cuenta = { disponible: 0, proponer: 0, crear: [] as Record<string, unknown>[] };
  await page.route('**/api/series/repetir-mes', r => {
    if (r.request().method() === 'GET') { cuenta.disponible++; return json(r, o.disponible ?? { disponible: true }); }
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    if (cuerpo.accion === 'proponer') { cuenta.proponer++; return json(r, { ok: true, propuesta: PROPUESTA }); }
    cuenta.crear.push(cuerpo);
    const resp = o.crear ?? { body: { ok: true, resultado: { creadas: 5, pedidas: 5, fallidas: 0, pedidasFallidas: 0, sinInstructora: 0, ids: ['ses-n1'], primeraFecha: d(1) } } };
    if (resp.texto !== undefined) return r.fulfill({ status: resp.status ?? 504, contentType: 'text/html', body: resp.texto });
    return json(r, resp.body, resp.status ?? 200);
  });
  await ir(page, 'calendario');
  return cuenta;
}

const boton = (page: Page) => page.getByRole('button', { name: /^Repetir \p{L}+$/u });

test.describe('Calendario · Repetir este mes', () => {
  test.describe.configure({ timeout: 180_000 });

  test('apagado (sin interruptor o sin migrar) o una respuesta rara: no hay botón', async ({ page }) => {
    for (const disponible of [{ disponible: false }, {}]) {
      const cuenta = await abrirCalendario(page, { disponible });
      await expect.poll(() => cuenta.disponible, { timeout: 60_000 }).toBeGreaterThan(0);
      await expect(boton(page)).toHaveCount(0);
    }
  });

  test('propone el mes siguiente: festivo y «no renovar» sin marcar; desmarcar días baja el recuento y se manda solo lo marcado', async ({ page }) => {
    const cuenta = await abrirCalendario(page);
    await boton(page).click();
    const dialogo = page.getByTestId('confirmar-fechas');
    await expect(dialogo.getByText(/Las clases sueltas no se copian \(en \p{L}+ hay 4\)/u)).toBeVisible({ timeout: 60_000 });
    await expect(dialogo.getByText('Los festivos de la Comunidad de Madrid vienen sin marcar; los locales de tu ciudad, no: revisa esos días.')).toBeVisible();

    // La serie en «no renovar» viene sin marcar, con su motivo.
    const filas = dialogo.getByTestId('repetir-serie');
    await expect(filas).toHaveCount(3);
    await expect(filas.nth(2).getByText('Marcada «no renovar»')).toBeVisible();
    await expect(filas.nth(2).getByRole('checkbox')).not.toBeChecked();

    // El festivo, sin marcar y con su etiqueta. 4 + 3 creables, menos el festivo = 6.
    const festivo = dialogo.locator(`[data-fecha="${d(8)}"]`);
    await expect(festivo.getByText('Festivo en la Comunidad de Madrid: Fiesta de prueba')).toBeVisible();
    await expect(festivo.getByRole('checkbox')).not.toBeChecked();
    const crear = dialogo.getByTestId('confirmar-fechas-crear');
    await expect(crear).toHaveText('Crear 6 clases');

    // Quitar dos días: 4 clases. Y lo que se manda ya no los lleva.
    await dialogo.locator(`[data-fecha="${d(15)}"]`).getByRole('checkbox').uncheck();
    await dialogo.locator(`[data-fecha="${d(17)}"]`).getByRole('checkbox').uncheck();
    await expect(crear).toHaveText('Crear 4 clases');
    expect(cuenta.crear).toHaveLength(0);
    await crear.click();

    await expect(page.getByText(`5 clases creadas en ${NOMBRE_DESTINO}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver' })).toBeVisible();
    await expect(page.getByTestId('confirmar-fechas')).toHaveCount(0);
    expect(cuenta.proponer).toBeGreaterThan(0);
    expect(cuenta.crear).toHaveLength(1);
    expect(cuenta.crear[0].series).toEqual([
      { serieId: 'serie-a', periodoVisto: 1, fechas: [d(1), d(22)] },
      { serieId: 'serie-b', periodoVisto: 1, fechas: [d(3), d(10)] },
    ]);
  });

  test('recepción, que puede renovar clases, también ve «Repetir»', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/studios**', (r) => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'otra-cuenta',
      email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
    }));
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-rec', studio_id: 'studio-test', nombre: 'Ana Peña', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: 'auth-e2e-duena' },
    ]));
    let disponible = 0;
    await page.route('**/api/series/repetir-mes', r => { disponible++; return json(r, { disponible: true }); });
    await ir(page, 'calendario');
    await expect(boton(page)).toBeVisible({ timeout: 60_000 });
    expect(disponible).toBeGreaterThan(0);
  });

  test('si crear falla, el diálogo sigue abierto con el motivo y no se anuncia nada', async ({ page }) => {
    const cuenta = await abrirCalendario(page, { crear: { status: 500, body: { error: 'No se ha creado ninguna clase. Inténtalo de nuevo.' } } });
    await boton(page).click();
    const dialogo = page.getByTestId('confirmar-fechas');
    const crear = dialogo.getByTestId('confirmar-fechas-crear');
    await expect(crear).toHaveText('Crear 6 clases', { timeout: 60_000 });
    await crear.click();

    await expect(dialogo.getByRole('alert')).toHaveText('No se ha creado ninguna clase. Inténtalo de nuevo.');
    await expect(dialogo).toBeVisible();
    await expect(page.getByText(/clases creadas en/)).toHaveCount(0);
    expect(cuenta.crear.length).toBeGreaterThan(0);
  });

  test('si se corta sin respuesta (504 de la plataforma), no dice «no se ha creado»: avisa de que puede haber parte y vuelve a leer el calendario', async ({ page }) => {
    const cuenta = await abrirCalendario(page, { crear: { status: 504, body: null, texto: '<html>An error occurred with your deployment</html>' } });
    let lecturasCalendario = 0;
    page.on('request', (req) => { if (/\/api\/calendario\?desde=/.test(req.url())) lecturasCalendario++; });
    await boton(page).click();
    const dialogo = page.getByTestId('confirmar-fechas');
    const crear = dialogo.getByTestId('confirmar-fechas-crear');
    await expect(crear).toHaveText('Crear 6 clases', { timeout: 60_000 });
    const antes = lecturasCalendario;
    await crear.click();

    await expect(dialogo.getByRole('alert')).toContainText('puede que parte ya esté creada');
    await expect(dialogo.getByRole('alert')).toContainText('Volver a intentarlo no duplica nada');
    await expect(dialogo.getByText('No se ha creado ninguna clase')).toHaveCount(0);
    expect(cuenta.crear.length).toBeGreaterThan(0);
    // Lo que se haya creado se ve: el calendario se vuelve a pedir al servidor.
    await expect.poll(() => lecturasCalendario, { timeout: 20_000 }).toBeGreaterThan(antes);
  });

  test('a medias: el texto dice cuántas de cuántas y que una no se pudo repetir', async ({ page }) => {
    const cuenta = await abrirCalendario(page, {
      crear: { body: { ok: true, resultado: { creadas: 4, pedidas: 6, fallidas: 1, pedidasFallidas: 2, sinInstructora: 0, ids: [], primeraFecha: d(1) } } },
    });
    await boton(page).click();
    const crear = page.getByTestId('confirmar-fechas-crear');
    await expect(crear).toHaveText('Crear 6 clases', { timeout: 60_000 });
    await crear.click();
    await expect(page.getByText(`4 de 6 clases creadas en ${NOMBRE_DESTINO} · una clase semanal no se ha podido repetir`)).toBeVisible();
    expect(cuenta.crear.length).toBeGreaterThan(0);
  });
});
