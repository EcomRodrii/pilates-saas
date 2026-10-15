import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El módulo Festivos (14-oct-2026). En un fichero propio a
// propósito: `panel-nuevo-secciones.spec.ts` lo tocan otras ramas.
//
// Lo que se prueba es lo que importa de verdad:
//   · está para todos los estudios (desde el 14-oct), con o sin el panel nuevo;
//   · la búsqueda enseña TODOS los festivos (los del boletín y los locales de
//     la IA), con lo que ya está en la lista a la vista y sin volver a añadirlo;
//     vienen marcados los oficiales y lo de la IA con fuente, y lo de la IA sin
//     fuente, desmarcado; solo se guarda lo marcado;
//   · los fuegos artificiales salen cuando el servidor confirma, no antes, y
//     nunca con «reducir movimiento»;
//   · si guardar falla, se dice y no hay fuegos (con contador de intentos: un
//     test de fallo sin él puede pasar por no haber intentado nada);
//   · «Comprobar clases» no cancela nada sin confirmación, y cerrar es el
//     POST /api/cierres de siempre.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

// Días en hora del ESTUDIO, nunca en la del proceso (en CI es UTC).
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const dia = (n: number) => {
  const d = new Date(`${HOY}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const OFICIALES = [
  { id: null, fecha: dia(20), nombre: 'Fiesta de prueba', ambito: 'nacional', origen: 'oficial', fuente: 'BOE núm. 259, de 28 de octubre de 2025', fuenteUrl: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667', estado: null },
  { id: null, fecha: dia(60), nombre: 'Otra fiesta', ambito: 'autonomico', origen: 'oficial', fuente: 'BOJA núm. 84, de 5 de mayo de 2026', fuenteUrl: 'https://www.juntadeandalucia.es/eboja/x.pdf', estado: null },
];
const GUARDADO = { id: '7b1c6a3e-4d2f-4a1b-9c3d-5e6f7a8b9c0d', fecha: dia(30), nombre: 'Virgen del Mar', ambito: 'local', origen: 'ia', fuente: 'almeria.es', fuenteUrl: 'https://www.almeria.es/fiestas', estado: null };

const lista = (festivos: unknown[]) => ({ hoy: HOY, localidad: 'Almería', comunidad: 'Andalucía', festivos });

const BUSQUEDA = {
  localidad: 'Almería', comunidad: 'Andalucía', otraComunidad: null, sinCalendario: [],
  propuestos: [
    { fecha: dia(20), nombre: 'Fiesta de prueba', ambito: 'nacional', origen: 'oficial', fuente: 'BOE núm. 259, de 28 de octubre de 2025', fuenteUrl: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667', yaEnLista: true },
    { fecha: dia(30), nombre: 'Virgen del Mar', ambito: 'local', origen: 'ia', fuente: 'almeria.es', fuenteUrl: 'https://www.almeria.es/fiestas', yaEnLista: false },
    { fecha: dia(60), nombre: 'Otra fiesta', ambito: 'autonomico', origen: 'oficial', fuente: 'BOJA núm. 84, de 5 de mayo de 2026', fuenteUrl: 'https://www.juntadeandalucia.es/eboja/x.pdf', yaEnLista: true },
    { fecha: dia(90), nombre: 'Año Nuevo', ambito: 'nacional', origen: 'oficial', fuente: 'BOE núm. 259', fuenteUrl: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667', yaEnLista: false },
    { fecha: dia(200), nombre: 'San Indalecio', ambito: 'local', origen: 'ia', fuente: null, fuenteUrl: null, yaEnLista: false },
  ],
  ia: 'ok',
  avisos: ['El Ayuntamiento aún no ha publicado las fiestas locales del año que viene'],
};

async function preparar(page: Page, o: { nuevo: boolean }) {
  await montar(page);
  // Después de `montar`: ganan a sus comodines.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo,
  }));
}

/** La lista y el guardado: lo que se guardó aparece al volver a leer. */
async function conLista(page: Page, guardar: (cuerpo: unknown) => { status: number; body: unknown }) {
  const enviados: unknown[] = [];
  let guardado = false;
  await page.route((u) => u.pathname === '/api/festivos/estudio', (r) => {
    if (r.request().method() === 'POST') {
      const cuerpo = r.request().postDataJSON();
      enviados.push(cuerpo);
      const res = guardar(cuerpo);
      if (res.status === 200) guardado = true;
      return json(r, res.body, res.status);
    }
    return json(r, lista(guardado ? [...OFICIALES, GUARDADO] : OFICIALES));
  });
  return enviados;
}

const enlaceMenu = (page: Page) => page.locator('a[href="/festivos"]');

test('sin el panel nuevo también está: en el menú y su pantalla funciona (para todos los estudios desde el 14-oct)', async ({ page }) => {
  await preparar(page, { nuevo: false });
  await conLista(page, () => ({ status: 200, body: { ok: true, creados: [], yaEstaban: 0 } }));
  await ir(page, 'dashboard');
  await expect(page.locator('a[href="/calendario"]:visible').first()).toBeVisible({ timeout: 30_000 });
  await expect(enlaceMenu(page).first()).toBeAttached();
  await ir(page, 'festivos');
  await expect(page.getByRole('heading', { name: 'Festivos', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('festivo-fila')).toHaveCount(2);
});

test('si la API dice que no está (tabla sin migrar), la pantalla lo dice', async ({ page }) => {
  await preparar(page, { nuevo: false });
  await page.route((u) => u.pathname === '/api/festivos/estudio', (r) => json(r, { error: 'No disponible' }, 404));
  await ir(page, 'festivos');
  await expect(page.getByTestId('festivos-no-disponible')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Añadir festivos' })).toHaveCount(0);
});

test('la búsqueda enseña todos los festivos, marca los nuevos y solo guarda lo marcado; fuegos al guardar', async ({ page }) => {
  await preparar(page, { nuevo: true });
  const enviados = await conLista(page, (c) => ({ status: 200, body: { ok: true, creados: (c as { festivos: { fecha: string }[] }).festivos.map(f => f.fecha), yaEstaban: 0 } }));
  let busquedas = 0;
  await page.route((u) => u.pathname === '/api/festivos/buscar', (r) => { busquedas++; return json(r, BUSQUEDA); });

  await ir(page, 'festivos');
  await expect(page.getByRole('heading', { name: 'Festivos', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(enlaceMenu(page).first()).toBeVisible();
  await expect(page.getByTestId('festivo-fila')).toHaveCount(2);
  await expect(page.getByTestId('festivos-faltan-locales')).toBeVisible();

  await page.getByRole('button', { name: 'Añadir festivos' }).click();
  const panel = page.getByRole('dialog', { name: 'Añadir festivos' });
  await expect(panel.getByRole('textbox')).toHaveValue('Almería');
  await panel.getByRole('button', { name: /Buscar los festivos de mi localidad/ }).click();

  // Todos, en una lista: los del boletín y los locales.
  await expect(panel.getByTestId('festivo-encontrado')).toHaveCount(5);
  expect(busquedas).toBe(1);
  await expect(panel.getByText('El Ayuntamiento aún no ha publicado')).toBeVisible();
  // Lo que ya está en la lista se ve, con su ✓, y no se puede volver a añadir.
  const ya = panel.locator(`[data-testid="festivo-encontrado"][data-fecha="${dia(20)}"]`);
  await expect(ya.getByText('Ya en tu lista')).toBeVisible();
  await expect(ya.getByRole('checkbox')).toHaveCount(0);
  // Marcados: el oficial nuevo y lo de la IA con fuente. Sin fuente, a su criterio.
  await expect(panel.getByRole('checkbox', { name: /Año Nuevo/ })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /Virgen del Mar/ })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /San Indalecio/ })).not.toBeChecked();
  await expect(panel.getByText('2 de 3 marcados')).toBeVisible();

  await panel.getByRole('button', { name: 'Añadir 2 festivos' }).click();
  await expect.poll(() => enviados.length).toBeGreaterThan(0);
  expect(enviados[0]).toEqual({
    localidad: 'Almería',
    festivos: [
      { fecha: dia(30), nombre: 'Virgen del Mar', origen: 'ia', ambito: 'local', fuenteUrl: 'https://www.almeria.es/fiestas' },
      { fecha: dia(90), nombre: 'Año Nuevo', origen: 'oficial', ambito: 'nacional', fuenteUrl: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667' },
    ],
  });
  await expect(page.getByTestId('fuegos-artificiales')).toBeAttached();
  await expect(page.getByText('2 festivos añadidos a tu lista')).toBeVisible();
  // Se cierra solo y la lista ya lo trae.
  await expect(panel).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId('festivo-fila')).toHaveCount(3);
  await expect(page.getByTestId('festivos-faltan-locales')).toHaveCount(0);
});

test('si todo está ya en la lista, lo dice y no hay nada que añadir', async ({ page }) => {
  await preparar(page, { nuevo: true });
  const enviados = await conLista(page, () => ({ status: 200, body: { ok: true, creados: [], yaEstaban: 0 } }));
  await page.route((u) => u.pathname === '/api/festivos/buscar', (r) => json(r, {
    ...BUSQUEDA, propuestos: BUSQUEDA.propuestos.map(f => ({ ...f, yaEnLista: true })),
  }));

  await ir(page, 'festivos');
  await page.getByRole('button', { name: 'Añadir festivos' }).click({ timeout: 30_000 });
  const panel = page.getByRole('dialog', { name: 'Añadir festivos' });
  await panel.getByRole('button', { name: /Buscar los festivos de mi localidad/ }).click();
  await expect(panel.getByTestId('festivo-encontrado')).toHaveCount(5);
  await expect(panel.getByRole('checkbox')).toHaveCount(0);
  await expect(panel.getByText('Ya tienes todos en tu lista')).toBeVisible();
  expect(enviados).toHaveLength(0);
});

test('si guardar falla, lo dice y no hay fuegos', async ({ page }) => {
  await preparar(page, { nuevo: true });
  const enviados = await conLista(page, () => ({ status: 500, body: { error: 'No se han podido guardar. Inténtalo de nuevo.' } }));
  await page.route((u) => u.pathname === '/api/festivos/buscar', (r) => json(r, BUSQUEDA));

  await ir(page, 'festivos');
  await page.getByRole('button', { name: 'Añadir festivos' }).click({ timeout: 30_000 });
  const panel = page.getByRole('dialog', { name: 'Añadir festivos' });
  await panel.getByRole('button', { name: /Buscar los festivos de mi localidad/ }).click();
  await panel.getByRole('button', { name: 'Añadir 2 festivos' }).click();

  await expect.poll(() => enviados.length).toBeGreaterThan(0);
  await expect(panel.getByRole('alert')).toContainText('No se han podido guardar');
  await expect(page.getByTestId('fuegos-artificiales')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Añadir 2 festivos' })).toBeEnabled();
});

test('con la IA caída se dice, salen igual los del boletín y se puede añadir a mano', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await conLista(page, () => ({ status: 200, body: { ok: true, creados: [], yaEstaban: 0 } }));
  await page.route((u) => u.pathname === '/api/festivos/buscar', (r) => json(r, {
    ...BUSQUEDA, propuestos: BUSQUEDA.propuestos.filter(f => f.origen === 'oficial'), ia: 'error',
    avisos: ['No hemos podido buscar las fiestas locales ahora. Inténtalo en un rato, o añádelas a mano.'],
  }));

  await ir(page, 'festivos');
  await page.getByRole('button', { name: 'Añadir festivos' }).click({ timeout: 30_000 });
  const panel = page.getByRole('dialog', { name: 'Añadir festivos' });
  await panel.getByRole('button', { name: /Buscar los festivos de mi localidad/ }).click();
  await expect(panel.getByText('No hemos podido buscar las fiestas locales ahora')).toBeVisible();
  await expect(panel.getByTestId('festivo-encontrado')).toHaveCount(3);
  await expect(panel.locator('[data-testid="festivo-encontrado"][data-origen="ia"]')).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: /Año Nuevo/ })).toBeChecked();
  await panel.getByRole('button', { name: 'Uno a mano' }).click();
  await expect(page.getByRole('dialog', { name: 'Añadir festivos' }).getByText('Añadir un festivo a mano')).toBeVisible();
});

test('con «reducir movimiento», sin fuegos (pero añadido igual)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await preparar(page, { nuevo: true });
  await conLista(page, (c) => ({ status: 200, body: { ok: true, creados: (c as { festivos: { fecha: string }[] }).festivos.map(f => f.fecha), yaEstaban: 0 } }));
  await page.route((u) => u.pathname === '/api/festivos/buscar', (r) => json(r, BUSQUEDA));

  await ir(page, 'festivos');
  await page.getByRole('button', { name: 'Añadir festivos' }).click({ timeout: 30_000 });
  const panel = page.getByRole('dialog', { name: 'Añadir festivos' });
  await panel.getByRole('button', { name: /Buscar los festivos de mi localidad/ }).click();
  await panel.getByRole('button', { name: 'Añadir 2 festivos' }).click();
  await expect(page.getByText('2 festivos añadidos a tu lista')).toBeVisible();
  await expect(page.getByTestId('fuegos-artificiales')).toHaveCount(0);
});

test('«Comprobar clases» cuenta, y cerrar pide confirmación y va por /api/cierres', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await conLista(page, () => ({ status: 200, body: { ok: true, creados: [], yaEstaban: 0 } }));
  await page.route((u) => u.pathname === '/api/festivos', (r) => json(r, {
    disponible: true, zona: 'Andalucía', hoy: HOY, propios: false,
    festivos: [{ fecha: dia(20), nombre: 'Fiesta de prueba', clases: 3, reservas: 12 }],
  }));
  const cierres: unknown[] = [];
  await page.route((u) => u.pathname === '/api/cierres', (r) => {
    cierres.push(r.request().postDataJSON());
    return json(r, { dias: 1, clasesCanceladas: 3, bonosAmpliados: 5 });
  });

  await ir(page, 'festivos');
  await page.getByRole('button', { name: 'Comprobar clases' }).click({ timeout: 30_000 });
  const panel = page.getByRole('dialog', { name: 'Clases en tus festivos' });
  await expect(panel.getByText('tienes 3 clases y 12 reservas confirmadas')).toBeVisible();

  await panel.getByRole('button', { name: /^Cerrar el / }).click();
  // Nada se cancela hasta confirmar.
  expect(cierres).toHaveLength(0);
  await page.getByRole('button', { name: 'Sí, cerrar ese día' }).click();
  await expect.poll(() => cierres.length).toBeGreaterThan(0);
  expect(cierres[0]).toEqual({ desde: dia(20), hasta: dia(20), motivo: 'Festivo: Fiesta de prueba' });
  await expect(panel.getByText('Ningún festivo tiene clases sin decidir')).toBeVisible();
});

test('recepción: sin Festivos en el menú ni su pantalla', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await conLista(page, () => ({ status: 200, body: { ok: true, creados: [], yaEstaban: 0 } }));
  // La sesión es de una recepcionista: el estudio es de otra persona y su ficha dice RECEPCION.
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'otra-duena', moneda: 'EUR', ciudad: 'Almería',
  }));
  await page.route('**/rest/v1/instructores**', (r) => json(r, [
    { id: 'ins-ana', studio_id: 'studio-test', nombre: 'Ana', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: 'auth-e2e-duena' },
  ]));
  await ir(page, 'dashboard');
  await expect(page.locator('a[href="/calendario"]:visible').first()).toBeVisible({ timeout: 30_000 });
  await expect(enlaceMenu(page)).toHaveCount(0);
  await ir(page, 'festivos');
  await expect(page.getByTestId('pantalla-festivos')).toHaveCount(0);
});
