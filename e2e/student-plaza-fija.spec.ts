import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Plaza fija + recuperaciones (F2, el caso canónico) en la Student PWA.
// El backend las tenía enteras y el payload las traía; la app las ignoraba.
// Lo que rompe a una alumna: no ver su plaza, no saber que tiene una clase
// por recuperar ni hasta cuándo, y que al cancelar su ocurrencia de plaza fija
// la app diga «no se devuelve» cuando el servidor SÍ le dio una recuperación.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { plaza?: boolean; recuperaciones?: number; cancelacion?: Record<string, unknown> } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  const socia = f.socia as unknown as Record<string, unknown>;
  // El reloj de sembrarSociaLista es el 2026-08-12 (miércoles, dow 3).
  socia.plazasFijas = opts.plaza === false ? [] : [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  socia.recuperaciones = Array.from({ length: opts.recuperaciones ?? 0 }, (_, i) => ({ id: `rec-${i}`, studioId: STUDIO_ID, socioId: SOCIO_ID, origenReservaId: null, motivo: null, caducaEl: `2026-09-${10 + i}`, estado: 'DISPONIBLE', usadaEnReservaId: null, creadaEn: '2026-08-01T00:00:00Z' }));
  if (opts.cancelacion) {
    (f.socia.reservas as unknown[]).push({ id: 'res-pf', sesionId: SESION_ID, socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null });
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
  if (opts.cancelacion) {
    await page.route('**/api/public/reserva', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.cancelacion) }));
  }
}

test.describe('Student PWA · plaza fija y recuperaciones', () => {
  test('Bonos se queda con las recuperaciones; la clase fija vive en Mis clases → Fijas', async ({ page }) => {
    await montar(page, { recuperaciones: 2 });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('2 clases por recuperar')).toBeVisible();
    await expect(tarjeta.getByText(/La primera caduca el/)).toBeVisible();
    await expect(tarjeta.getByText('Jueves · 18:00')).toHaveCount(0);

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await expect(page.getByRole('tab', { name: 'Fijas' })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
    const mia = page.getByTestId('clase-fija-mia');
    await expect(mia).toContainText('Los jueves · 18:00', { timeout: 30_000 });
    await expect(mia).toContainText('Reformer · Sala 1');
  });

  test('sin plaza ni recuperaciones no se pinta nada (ni en Bonos ni en Inicio)', async ({ page }) => {
    await montar(page, { plaza: false, recuperaciones: 0 });
    await page.goto(`${base}/bonos`);
    await expect(page.getByRole('heading', { name: /bonos/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
    await page.goto(base);
    await expect(page.getByText(/¿qué te apetece hoy\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('plaza-fija')).toHaveCount(0);
  });

  test('Inicio: tarjeta compacta con la plaza', async ({ page }) => {
    await montar(page);
    await page.goto(base);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText(/Reformer · Sala 1 · próxima mañana/)).toBeVisible();
    await expect(tarjeta.getByText('Activa')).toBeVisible();
    await expect(tarjeta.getByTestId('ver-mis-clases-fijas')).toHaveAttribute('href', `${base}/mis-reservas?tab=fijas`);
  });

  // Plaza fija desde su app (migr 20260915231920): PIDE, no cambia. El ajuste del
  // estudio lo resuelve el servidor (`lib/studio-seo.ts`), encendido en e2e con
  // `E2E_PLAZA_FIJA_APP` (playwright.config.ts).
  test('Mis clases → Fijas: pide una pausa de su plaza fija y queda a la espera del estudio', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-1' }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    // El reloj de `sembrarSociaLista` es el 2026-08-12.
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    // Un camino que no llega a pedir nada «no miente», y no probaría nada.
    await expect(tarjeta.getByText(/Pausa pedida del .* esperando a tu estudio/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    expect(cuerpo).toMatchObject({ accion: 'solicitar_pausa', plazaId: 'pf-1', hasta: '2026-08-26' });
    // Hasta que el estudio conteste, su plaza sigue igual.
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  test('si el servidor dice que no, la app no dice que sí', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ya has pedido una pausa para esta plaza fija: tu estudio te contestará.' }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
    await page.getByLabel('Hasta').fill('2026-08-26');
    await page.getByRole('button', { name: 'Pedir la pausa' }).click();

    await expect(page.getByText(/Ya has pedido una pausa para esta plaza fija/)).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByText(/Pausa pedida del/)).toHaveCount(0);
  });

  test('al cancelar una ocurrencia de plaza fija, el toast dice que hay una clase para recuperar y hasta cuándo', async ({ page }) => {
    await montar(page, { cancelacion: { ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-11' } });
    await page.goto(`${base}/mis-reservas`);
    // Botón «Cancelar» de la tarjeta → diálogo → «Sí, cancelar…» (el copy exacto
    // depende del aviso de ventana; la confirmación empieza siempre igual).
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Sí, cancelar/ }).click();
    // `fechaCorta('2026-09-11')` → «vie 11 sep»: se comprueba el día y el número.
    await expect(page.getByText(/tienes una clase para recuperar hasta el \w+ 11 \w+/i)).toBeVisible({ timeout: 30_000 });
  });
});


// ── Cómo se marca una alumna en una clase fija ───────────────────────────────
//
// Dos fichas distintas para la misma clase (quejas de estudios, 23-sep: con las
// dos acciones en una pantalla las alumnas no sabían cuál tocar):
//   · la de una clase del horario (`/reservar/[id]`) SOLO reserva — ni antes ni
//     después de reservar se habla de clase fija;
//   · la de una clase fija (`/clases-fijas/[id]`, desde «Clases fijas») SOLO pide
//     la clase fija: con cuota, el botón; con bono, por qué no y a las cuotas.
// El ajuste del estudio (`plaza_fija_solicitar_desde_app`) va encendido en e2e.

async function montarClaseQueSeRepite(page: Page, plan: 'cuota' | 'bono' | 'ninguno', opts: { laTiene?: boolean } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  // La clase del fixture es el miércoles 12 de agosto a las 10:00: se repite el 19.
  (f.sesiones as unknown[]).push({
    id: 'ses-11', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: '2026-08-19T10:00:00', fin: '2026-08-19T10:50:00', aforoMaximo: 10, cancelada: false,
  });
  if (plan === 'cuota') {
    f.planesTarifa = [{ id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual', tipo: 'MENSUAL', sesiones: null, precio: 60, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-c', socioId: SOCIO_ID, planId: 'plan-cuota', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null },
    ];
  }
  if (plan === 'bono') {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-b', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  if (opts.laTiene) {
    (f.socia as Record<string, unknown>).plazasFijas = [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 3, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  // Las clases fijas del estudio: esta clase, suelta (sin oferta con nombre).
  await page.route('**/api/public/clases-fijas', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ofertas: [], pedidas: [],
      sueltas: [{
        serieId: 'serie-1', diaSemana: 3, hora: '10:00', tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
        tipo: 'Reformer', sala: 'Sala 1', instructora: null, logoUrl: null, color: null, proximaSesionId: SESION_ID, ultimaFecha: '2026-12-30',
      }],
    }),
  }));
}

/** La petición de plaza fija que llega al servidor, contada, para no dar por bueno un camino que no pide nada. */
async function contarPeticiones(page: Page, respuesta: { status: number; body: unknown } = { status: 200, body: { ok: true, solicitudId: 'spf-9' } }) {
  const visto = { intentos: 0, cuerpo: null as Record<string, unknown> | null };
  await page.route('**/api/public/plaza-fija', (r) => {
    visto.intentos++;
    visto.cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    return r.fulfill({ status: respuesta.status, contentType: 'application/json', body: JSON.stringify(respuesta.body) });
  });
  return visto;
}

test.describe('Student PWA · cómo pedir una plaza fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('la ficha de una clase del horario solo reserva: ni antes ni después se habla de clase fija', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Reservar$/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
    await expect(page.getByText(/¿Vienes los/)).toHaveCount(0);

    await page.getByRole('button', { name: /^Reservar$/ }).first().click();
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('oferta-plaza-fija')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
  });

  test('la ficha de una clase fija solo pide la clase fija: con su día y su hora, sin «Reservar»', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/clases-fijas/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    // La hora NO se fija en el test: el fixture da la clase sin zona, así que en
    // el CI (UTC) sale a las 12:00 del estudio y en una máquina en Madrid a las
    // 10:00. Lo que se defiende es que lleve SU día y SU hora, sea la que sea.
    await expect(page.getByText(/¿Vienes los miércoles a las \d{2}:\d{2}\?/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Tu estudio tiene que confirmarla/)).toBeVisible();
    await expect(page.getByText(/^Todos los miércoles · \d{2}:\d{2}$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Reservar$/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Pedir clase fija' }).click();
    await expect(page.getByTestId('clase-fija-pedida')).toHaveText(/Ya la has pedido: tu estudio te contestará aquí/, { timeout: 30_000 });
    expect(visto.intentos).toBeGreaterThan(0);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza', sesionId: SESION_ID });
    await expect(page.getByRole('button', { name: 'Anular la petición' })).toBeVisible();
  });

  test('si el servidor dice que no, la ficha no dice que sí', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page, { status: 409, body: { error: 'Ya tienes otra clase a esa hora.' } });
    await page.goto(`${base}/clases-fijas/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Pedir clase fija' }).click({ timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Ya tienes otra clase a esa hora.' })).toBeVisible({ timeout: 30_000 });
    expect(visto.intentos, 'la petición salió de verdad').toBeGreaterThan(0);
    await expect(page.getByTestId('clase-fija-pedida')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toBeVisible();
  });

  test('con bono no hay botón que no va a funcionar: se le dice por qué y se le lleva a las cuotas', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/clases-fijas/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('clase-fija-solo-cuota')).toContainText('La clase fija es para quien tiene una cuota activa', { timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Ver las cuotas' })).toHaveAttribute('href', `${base}/comprar`);
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
    expect(visto.intentos, 'nada sale hacia el servidor').toBe(0);
  });

  test('si ya es suya, lo dice y la lleva a sus clases fijas', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota', { laTiene: true });
    await page.goto(`${base}/clases-fijas/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Ya es tu clase fija ✓')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Ver mis clases fijas' })).toHaveAttribute('href', `${base}/mis-reservas?tab=fijas`);
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
  });
});


// ── Su clase fija: qué ve cuando ya la tiene ─────────────────────────────────
//
// Los estudios decían que no tenían claro que la alumna NO reserva. Su tarjeta
// tiene que decir que la plaza está reservada sola, enseñar las próximas clases
// que ya tiene y dejar que falte UNA semana sin tocar la clase fija. Con lo que
// SÍ hace el servidor: se cancela solo la reserva de esa semana (`res-pf-`).

// ⚠️ Con su desfase (+02:00, verano en Madrid), NO como las del resto del fixture
// (`2026-08-12T10:00:00`, sin zona). Sin él el navegador las lee en su zona local y
// la hora del estudio sale 10:00 en una máquina en Madrid y 12:00 en el CI (UTC):
// la plaza fija de las 10:00 dejaba de coincidir con sus clases y «Próximas
// clases» salía vacía solo en el CI. Aquí la hora tiene que ser SIEMPRE la misma.
const CLASES_FIJAS = [
  { id: 'res-pf-s20', sesion: 'ses-20', inicio: '2026-08-13T10:00:00+02:00', fin: '2026-08-13T10:50:00+02:00' },
  { id: 'res-pf-s21', sesion: 'ses-21', inicio: '2026-08-20T10:00:00+02:00', fin: '2026-08-20T10:50:00+02:00' },
  { id: 'res-pf-s22', sesion: 'ses-22', inicio: '2026-08-27T10:00:00+02:00', fin: '2026-08-27T10:50:00+02:00' },
];

// Los jueves siguientes, también en horario de verano (+02:00): el motor reserva la
// clase fija con meses de antelación, y «Mis clases» no puede volverse una lista de
// medio año.
const JUEVES_EXTRA = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];

async function montarConClaseFija(page: Page, opts: {
  reservaAMano?: boolean; masFijas?: number;
  /** Estado distinto de CONFIRMADA para alguna reserva de la clase fija (por id). */
  estados?: Record<string, string>;
  /** Reservas de la clase fija que NO existen: la clase está, la reserva no. */
  sinReserva?: string[];
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const sesiones = f.sesiones as unknown[];
  const clasesFijas = [
    ...CLASES_FIJAS,
    ...JUEVES_EXTRA.slice(0, opts.masFijas ?? 0).map((dia, i) => ({
      id: `res-pf-x${i}`, sesion: `ses-x${i}`, inicio: `${dia}T10:00:00+02:00`, fin: `${dia}T10:50:00+02:00`,
    })),
  ];
  for (const c of clasesFijas) {
    sesiones.push({ id: c.sesion, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: c.inicio, fin: c.fin, aforoMaximo: 10, cancelada: false });
  }
  const socia = f.socia as Record<string, unknown>;
  // El reloj de `sembrarSociaLista` es el 2026-08-12: los jueves 13, 20 y 27 a las 10:00 (hora del fixture).
  socia.plazasFijas = [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z' }];
  socia.reservas = [
    ...clasesFijas.filter((c) => !opts.sinReserva?.includes(c.id)).map((c) => ({
      id: c.id, sesionId: c.sesion, socioId: SOCIO_ID, estado: opts.estados?.[c.id] ?? 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null,
    })),
    // Una reserva de una vez, en OTRO día: no es de su clase fija y no puede salir en «Próximas clases».
    ...(opts.reservaAMano ? [{ id: 'res-mano-1', sesionId: 'ses-10', socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-02T00:00:00Z', posicionEspera: null }] : []),
  ];
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
}

test.describe('Student PWA · tu clase fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('dice que la plaza está reservada sola y enseña las próximas clases que ya tiene', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByTestId('clase-fija-mia')).toContainText('Los jueves · 10:00');
    await expect(tarjeta.getByTestId('plaza-fija-reservada-sola')).toHaveText('Tu plaza está reservada automáticamente cada semana. No necesitas reservar esta clase.');

    // Las tres que el motor le tiene reservadas, y NO la que reservó a mano.
    const proximas = tarjeta.getByTestId('proximas-clases-fijas');
    await expect(proximas.getByText('Próximas clases')).toBeVisible();
    await expect(proximas.getByText('Reservada')).toHaveCount(3);
    await expect(proximas.getByRole('button', { name: 'No puedo asistir' })).toHaveCount(3);
    // Y cómo dejarla o cambiarla: no se hace desde la app, se escribe al estudio.
    await expect(tarjeta.getByRole('link', { name: 'Escribir al estudio' })).toHaveAttribute('href', `${base}/mensajes`);
  });

  test('cada próxima clase de su clase fija abre su ficha, como en el horario', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    // Cada próxima, a la ficha de ESE día (donde se ve y se cancela ese día).
    const proximas = tarjeta.getByTestId('proximas-clases-fijas');
    await expect(proximas.getByTestId('enlace-clase-fija')).toHaveCount(3);
    await expect(proximas.getByTestId('enlace-clase-fija').nth(1)).toHaveAttribute('href', `${base}/reservar/ses-21`);
    // «No puedo asistir» sigue siendo un botón aparte: no abre la ficha.
    await expect(proximas.getByRole('button', { name: 'No puedo asistir' })).toHaveCount(3);
    await proximas.getByTestId('enlace-clase-fija').first().click();
    await expect(page).toHaveURL(new RegExp(`${base}/reservar/ses-20$`), { timeout: 30_000 });
  });

  test('«No puedo asistir» cancela SOLO esa semana y dice que su clase fija sigue', async ({ page }) => {
    await montarConClaseFija(page);
    const cancelaciones: Record<string, unknown>[] = [];
    await page.route('**/api/public/reserva', (r) => {
      const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      if (r.request().method() !== 'POST' || cuerpo.accion !== 'cancelar') return r.continue();
      cancelaciones.push(cuerpo);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: false }) });
    });

    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await tarjeta.getByRole('button', { name: 'No puedo asistir' }).first().click();

    // Antes de confirmar se le dice qué toca: solo esta clase, y nada de «tu bono».
    const aviso = page.getByTestId('no-puedo-aviso');
    await expect(aviso).toContainText('Solo cancelas esta clase. Tu clase fija de los jueves sigue activa');
    await expect(aviso).not.toContainText('bono');
    await page.getByRole('button', { name: 'Sí, no puedo asistir' }).click();

    await expect(page.getByText('Cancelada solo esta semana · tu clase fija sigue activa ✓')).toBeVisible({ timeout: 30_000 });
    // Un camino que no llega a cancelar nada «no miente», y no probaría nada.
    expect(cancelaciones.length).toBeGreaterThan(0);
    expect(cancelaciones[0]).toMatchObject({ reservaId: 'res-pf-s20' });
    expect(cancelaciones, 'solo esa semana, no la recurrencia').toHaveLength(1);
  });

  test('«Mis clases»: la de su clase fija lo dice y no habla de bono; la de una vez es una reserva normal', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    // La reservada a mano NO es de su clase fija, aunque coincidiera el horario.
    await expect(page.getByText('Reservada ✓')).toHaveCount(1);

    await page.getByRole('button', { name: /^Cancelar$/ }).nth(1).click();
    const aviso = page.getByTestId('cancelar-clase-fija-aviso');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('Tu clase fija de los jueves sigue activa');
    await expect(page.getByText(/sesión de tu bono/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sí, no puedo asistir' })).toBeVisible();
  });

  test('«Mis clases»: con muchas clases fijas ya reservadas se enseñan las primeras y se dice cuántas más hay', async ({ page }) => {
    // 9 clases fijas + 1 reserva a mano. Las de la clase fija se acotan a las 6 primeras; la
    // reservada a mano no se acota nunca.
    await montarConClaseFija(page, { reservaAMano: true, masFijas: 6 });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu clase fija ✓')).toHaveCount(6);
    await expect(page.getByText('Reservada ✓')).toHaveCount(1);
    await expect(page.getByTestId('fijas-ocultas')).toHaveText('Y 3 clases más de tu clase fija, ya reservadas: irán apareciendo aquí según se acerquen.');
  });

  test('«Mis clases»: con pocas clases fijas no hay nada que acotar ni aviso de «más»', async ({ page }) => {
    await montarConClaseFija(page, { reservaAMano: true });
    await page.goto(`${base}/mis-reservas`);
    await expect(page.getByText('Tu clase fija ✓').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu clase fija ✓')).toHaveCount(3);
    await expect(page.getByTestId('fijas-ocultas')).toHaveCount(0);
  });
});

// ── El calendario del mes ────────────────────────────────────────────────────
//
// Sus días marcados, como en cualquier app de reservas que la alumna conozca. Lo
// que se defiende: que un check sea una reserva que EXISTE (no «le toca los
// jueves»), que el día que no va se vea distinto, y que un día sin reserva lo
// diga en vez de pintar un check que nadie ha hecho.
test.describe('Student PWA · tu clase fija · calendario del mes', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  const dia = (page: Page, fecha: string) => page.getByTestId('calendario-clase-fija').locator(`[data-testid="dia-clase-fija"][data-fecha="${fecha}"]`);

  test('marca los jueves que ya tiene reservados y cada día abre su clase', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const cal = page.getByTestId('calendario-clase-fija');
    await expect(cal).toBeVisible({ timeout: 30_000 });
    await expect(cal.getByText('Agosto de 2026', { exact: true })).toBeVisible();
    for (const [fecha, sesion] of [['2026-08-13', 'ses-20'], ['2026-08-20', 'ses-21'], ['2026-08-27', 'ses-22']]) {
      await expect(dia(page, fecha).locator('[data-marca="RESERVADA"]')).toHaveCount(1);
      await expect(dia(page, fecha)).toHaveAttribute('href', `${base}/reservar/${sesion}`);
    }
    // Un miércoles no le toca: ni marca ni enlace.
    await expect(cal.locator('[data-fecha="2026-08-19"]')).toHaveCount(0);
    await expect(cal.getByRole('list', { name: 'Leyenda' })).toContainText('Reservada');
    await expect(page.getByTestId('clase-fija-cambios')).toContainText('¿Un día no puedes venir?');
  });

  test('el día que no va sale distinto, y un día con clase sin reserva lo dice', async ({ page }) => {
    await montarConClaseFija(page, { estados: { 'res-pf-s21': 'CANCELADA' }, sinReserva: ['res-pf-s22'] });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    await expect(page.getByTestId('calendario-clase-fija')).toBeVisible({ timeout: 30_000 });
    await expect(dia(page, '2026-08-13').locator('[data-marca="RESERVADA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-20').locator('[data-marca="NO_VA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-27').locator('[data-marca="SIN_RESERVA"]')).toHaveCount(1);
    await expect(dia(page, '2026-08-27')).toHaveAttribute('aria-label', /jueves 27 de agosto: 10:00, sin reservar/);
    await expect(page.getByText('Si un día sale sin reservar, pregúntale a tu estudio')).toBeVisible();
  });

  test('se pasa de mes hasta donde hay clases, y no antes de hoy', async ({ page }) => {
    // Con los jueves de septiembre y los dos primeros de octubre también reservados.
    await montarConClaseFija(page, { masFijas: 6 });
    await page.goto(`${base}/mis-reservas?tab=fijas`);
    const cal = page.getByTestId('calendario-clase-fija');
    await expect(cal).toBeVisible({ timeout: 30_000 });
    await expect(cal.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();

    await cal.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(cal.getByText('Septiembre de 2026', { exact: true })).toBeVisible();
    for (const fecha of ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']) {
      await expect(dia(page, fecha).locator('[data-marca="RESERVADA"]')).toHaveCount(1);
    }

    await cal.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(cal.getByText('Octubre de 2026', { exact: true })).toBeVisible();
    await expect(cal.getByTestId('dia-clase-fija')).toHaveCount(2);
    await expect(cal.getByRole('button', { name: 'Mes siguiente' }).first()).toBeDisabled();

    await cal.getByRole('button', { name: 'Mes anterior' }).click();
    await cal.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(cal.getByText('Agosto de 2026', { exact: true })).toBeVisible();
  });

  test('en Inicio (tarjeta compacta) no sale el calendario', async ({ page }) => {
    await montarConClaseFija(page);
    await page.goto(base);
    await expect(page.getByTestId('plaza-fija')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('calendario-clase-fija')).toHaveCount(0);
  });
});
