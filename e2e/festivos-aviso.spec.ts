import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Un festivo con clases aparece en Inicio para que el estudio decida (P1.6).
//
// Nada se cierra solo: «Cerrar ese día» va al POST /api/cierres de siempre
// (mismo resultado que «Cerrar el centro») y «Abrimos igualmente» se apunta en
// /api/festivos. La fila se va SOLO cuando el servidor lo confirma. Cada camino
// de fallo lleva contador de peticiones: un «no mintió» sin intento es hueco.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const INMACULADA = { fecha: '2026-12-08', nombre: 'Inmaculada', clases: 6, reservas: 41 };
const NAVIDAD = { fecha: '2026-12-25', nombre: 'Navidad', clases: 2, reservas: 0 };
const LISTA = { disponible: true, zona: 'la Comunidad de Madrid', hoy: '2026-11-20', festivos: [INMACULADA] };
const ESTADO = {
  aplica: true, enMarcha: [], resuelto: [], nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
  decidir: [{ id: 'festivosPorDecidir', n: 1, texto: 'Un festivo con clases: decide si abres o cierras', href: null }],
};
const FRASE = 'El martes 8 de diciembre (Inmaculada) tienes 6 clases y 41 reservas confirmadas.';

type Respuesta = { status?: number; body: unknown };

async function abrirInicio(page: Page, o: { lista?: unknown; cierre?: Respuesta; abrir?: Respuesta; todos?: unknown } = {}) {
  await montar(page);
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  await page.route('**/api/estado-estudio', r => json(r, ESTADO));
  const cuenta = { lista: 0, todos: 0, cierres: [] as unknown[], abrir: [] as unknown[] };
  await page.route('**/api/festivos**', r => {
    if (r.request().method() === 'GET') {
      if (new URL(r.request().url()).searchParams.get('alcance') === 'todos') {
        cuenta.todos++;
        return json(r, o.todos ?? { ...LISTA, festivos: [INMACULADA, NAVIDAD] });
      }
      cuenta.lista++;
      return json(r, o.lista ?? LISTA);
    }
    cuenta.abrir.push(r.request().postDataJSON());
    const resp = o.abrir ?? { body: { ok: true, fecha: INMACULADA.fecha, nombre: INMACULADA.nombre } };
    return json(r, resp.body, resp.status ?? 200);
  });
  await page.route('**/api/cierres', r => {
    cuenta.cierres.push(r.request().postDataJSON());
    const resp = o.cierre ?? { body: { cierreId: 'cie-x', dias: 1, clasesCanceladas: 6, diasProrrogados: 1, diasYaProrrogados: 0, bonosAmpliados: 30, recuperacionesAmpliadas: 0, incidencias: [] } };
    return json(r, resp.body, resp.status ?? 200);
  });
  await ir(page, 'dashboard');
  return cuenta;
}

test.describe('Inicio · festivos con clases', () => {
  test.describe.configure({ timeout: 180_000 });

  test('dice qué día, cuántas clases y reservas, de dónde sale la comunidad, y deja ver el día', async ({ page }) => {
    const cuenta = await abrirInicio(page);
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta).toBeVisible({ timeout: 60_000 });
    await expect(tarjeta.getByText(FRASE)).toBeVisible();
    await expect(tarjeta.getByText(/Festivos oficiales de la Comunidad de Madrid, según la dirección de tu estudio\./)).toBeVisible();
    await expect(tarjeta.getByText(/No incluye las fiestas locales de tu municipio\./)).toBeVisible();
    await expect(tarjeta.getByRole('link', { name: 'Ver ese día en el calendario' })).toHaveAttribute('href', '/calendario?fecha=2026-12-08');
    // La propietaria puede corregir la dirección.
    await expect(tarjeta.getByRole('link', { name: 'corrígela' })).toBeVisible();
    expect(cuenta.lista).toBeGreaterThan(0);
  });

  test('«Ver ese día en el calendario» abre el Calendario en vista Día', async ({ page }) => {
    await abrirInicio(page);
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('link', { name: 'Ver ese día en el calendario' }).click();
    await expect(page).toHaveURL(/\/calendario$/, { timeout: 60_000 });
    await expect(page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Día' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('«Cerrar ese día» confirma con las consecuencias, cierra por /api/cierres y la fila se va', async ({ page }) => {
    const cuenta = await abrirInicio(page);
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('button', { name: 'Cerrar el martes 8 de diciembre' }).click();

    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText('¿Cerrar el martes 8 de diciembre?')).toBeVisible();
    await expect(dialogo.getByText(/Ese día nadie podrá reservar\. Se cancelan sus 6 clases avisando a quien tenía reserva/)).toBeVisible();
    await expect(dialogo.getByText(/Quitar el cierre después no devuelve las clases\./)).toBeVisible();
    expect(cuenta.cierres).toHaveLength(0);
    await dialogo.getByRole('button', { name: 'Sí, cerrar ese día' }).click();

    await expect(page.getByText('Martes 8 de diciembre: 1 día cerrado · 6 clases canceladas · 30 bonos prorrogados')).toBeVisible();
    await expect(page.getByTestId('festivo-por-decidir')).toHaveCount(0);
    expect(cuenta.cierres).toEqual([{ desde: '2026-12-08', hasta: '2026-12-08', motivo: 'Festivo: Inmaculada' }]);
  });

  test('si el cierre falla, lo dice en la fila, la fila sigue y no hay éxito', async ({ page }) => {
    const cuenta = await abrirInicio(page, { cierre: { status: 500, body: { error: 'No se pudo guardar el cierre: fallo' } } });
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('button', { name: 'Cerrar el martes 8 de diciembre' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sí, cerrar ese día' }).click();

    await expect(tarjeta.getByRole('alert')).toHaveText('No se pudo guardar el cierre: fallo');
    await expect(page.getByTestId('festivo-por-decidir')).toHaveCount(1);
    await expect(page.getByText(/día cerrado/)).toHaveCount(0);
    expect(cuenta.cierres.length).toBeGreaterThan(0);
  });

  test('«Abrimos igualmente» se guarda en el servidor y la fila se va', async ({ page }) => {
    const cuenta = await abrirInicio(page);
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('button', { name: 'Abrimos igualmente el martes 8 de diciembre' }).click();

    await expect(page.getByText('Apuntado: el martes 8 de diciembre abres. No te lo volvemos a preguntar; si cambias de idea, ciérralo en Configuración › Mi estudio.')).toBeVisible();
    await expect(page.getByTestId('festivo-por-decidir')).toHaveCount(0);
    expect(cuenta.abrir).toEqual([{ accion: 'abrir', fecha: '2026-12-08' }]);
    expect(cuenta.cierres).toHaveLength(0);
  });

  test('si «Abrimos igualmente» falla, lo dice y la fila sigue', async ({ page }) => {
    const cuenta = await abrirInicio(page, { abrir: { status: 500, body: { error: 'No se ha podido guardar. Inténtalo de nuevo.' } } });
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('button', { name: 'Abrimos igualmente el martes 8 de diciembre' }).click();

    await expect(tarjeta.getByRole('alert')).toHaveText('No se ha podido guardar. Inténtalo de nuevo.');
    await expect(page.getByTestId('festivo-por-decidir')).toHaveCount(1);
    await expect(page.getByText(/Apuntado/)).toHaveCount(0);
    expect(cuenta.abrir.length).toBeGreaterThan(0);
  });

  test('«Ver todos» enseña el resto del calendario cargado', async ({ page }) => {
    const cuenta = await abrirInicio(page);
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await tarjeta.getByRole('button', { name: 'Ver todos los festivos con clases' }).click();
    await expect(tarjeta.getByText('El viernes 25 de diciembre (Navidad) tienes 2 clases, todavía sin reservas.')).toBeVisible();
    expect(cuenta.todos).toBeGreaterThan(0);
  });

  test('apagado (sin interruptor o sin migrar) o una respuesta rara: no hay tarjeta', async ({ page }) => {
    for (const lista of [{ disponible: false }, {}]) {
      const cuenta = await abrirInicio(page, { lista });
      await expect.poll(() => cuenta.lista, { timeout: 60_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId('festivos-por-decidir')).toHaveCount(0);
    }
  });
});

test.describe('Inicio · festivos, gerencia', () => {
  test.describe.configure({ timeout: 180_000 });

  test('la gerencia, que también puede cerrar el centro, ve la tarjeta (sin el enlace para corregir la dirección)', async ({ page }) => {
    await montar(page);
    await page.route('**/rest/v1/studios**', (r) => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'otra-cuenta',
      email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
    }));
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-ger', studio_id: 'studio-test', nombre: 'Ana Peña', activo: true, rol: 'MANAGER', color: '#8B7355', auth_user_id: 'auth-e2e-duena' },
    ]));
    let festivos = 0;
    await page.route('**/api/estado-estudio', r => json(r, ESTADO));
    await page.route('**/api/festivos**', r => { festivos++; return json(r, LISTA); });
    await ir(page, 'dashboard');
    const tarjeta = page.getByTestId('festivos-por-decidir');
    await expect(tarjeta.getByText(FRASE)).toBeVisible({ timeout: 60_000 });
    await expect(tarjeta.getByRole('link', { name: 'corrígela' })).toHaveCount(0);
    await expect(tarjeta.getByText(/puede corregirla la propietaria/)).toBeVisible();
    expect(festivos).toBeGreaterThan(0);
  });
});

test.describe('Inicio · festivos, recepción', () => {
  test.describe.configure({ timeout: 180_000 });

  test('recepción no puede cerrar el centro: ni tarjeta ni una sola petición a /api/festivos', async ({ page }) => {
    await montar(page);
    // La sesión pasa a ser de recepción: el estudio es de otra cuenta y la ficha
    // del equipo con este usuario tiene rol RECEPCION.
    await page.route('**/rest/v1/studios**', (r) => json(r, {
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'otra-cuenta',
      email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
    }));
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-rec', studio_id: 'studio-test', nombre: 'Ana Peña', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: 'auth-e2e-duena' },
    ]));
    let estado = 0;
    let festivos = 0;
    await page.route('**/api/estado-estudio', r => { estado++; return json(r, { ...ESTADO, decidir: [] , nDecidir: 0 }); });
    await page.route('**/api/festivos**', r => { festivos++; return json(r, LISTA); });
    await ir(page, 'dashboard');
    // La home ha cargado de verdad (pidió la bandeja) y aun así no hubo ninguna petición de festivos.
    await expect.poll(() => estado, { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('festivos-por-decidir')).toHaveCount(0);
    expect(festivos).toBe(0);
  });
});
