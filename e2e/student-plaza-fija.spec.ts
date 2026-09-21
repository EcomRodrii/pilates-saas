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
  test('Bonos enseña la plaza fija con su próxima ocurrencia y las recuperaciones con su caducidad', async ({ page }) => {
    await montar(page, { recuperaciones: 2 });
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Jueves · 18:00')).toBeVisible();
    await expect(tarjeta.getByText(/Reformer · Sala 1 · próxima mañana/)).toBeVisible();
    await expect(tarjeta.getByText('2 clases por recuperar')).toBeVisible();
    await expect(tarjeta.getByText(/La primera caduca el/)).toBeVisible();
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
    await expect(tarjeta.getByText('Activa')).toBeVisible();
  });

  // Plaza fija desde su app (migr 20260915231920): PIDE, no cambia. El ajuste del
  // estudio lo resuelve el servidor (`lib/studio-seo.ts`), encendido en e2e con
  // `E2E_PLAZA_FIJA_APP` (playwright.config.ts).
  test('Bonos: pide una pausa de su plaza fija y queda a la espera del estudio', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    let cuerpo: Record<string, unknown> | null = null;
    await page.route('**/api/public/plaza-fija', (r) => {
      intentos++;
      cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-1' }) });
    });

    await page.goto(`${base}/bonos`);
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

    await page.goto(`${base}/bonos`);
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
// Los estudios decían que no les quedaba claro cómo se marcan ellas para no
// reservar cada semana. Lo que la app le dice a la alumna, según SU plan:
//   · con cuota → se le ofrece pedirla, con su día y su hora, y qué pasa después;
//   · con bono  → NO se le ofrece un botón que el servidor rechazaría: se le dice
//                 por qué (con bono no hay plaza fija);
//   · al terminar de reservar una clase que se repite, se le ofrece en ese mismo
//     momento, no solo dentro de la ficha.
// El ajuste del estudio (`plaza_fija_solicitar_desde_app`) va encendido en e2e.

async function montarClaseQueSeRepite(page: Page, plan: 'cuota' | 'bono' | 'ninguno') {
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
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
}

/** La petición de plaza fija que llega al servidor, contada, para no dar por bueno un camino que no pide nada. */
async function contarPeticiones(page: Page) {
  const visto = { intentos: 0, cuerpo: null as Record<string, unknown> | null };
  await page.route('**/api/public/plaza-fija', (r) => {
    visto.intentos++;
    visto.cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, solicitudId: 'spf-9' }) });
  });
  return visto;
}

test.describe('Student PWA · cómo pedir una plaza fija', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('con cuota: se le ofrece con su día y su hora, se le dice qué pasa y al pedirla queda a la espera', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    // La hora NO se fija en el test: el fixture da la clase sin zona, así que en
    // el CI (UTC) sale a las 12:00 del estudio y en una máquina en Madrid a las
    // 10:00. Lo que se defiende es que lleve SU día y SU hora, sea la que sea.
    await expect(page.getByText(/¿Vienes los miércoles a las \d{2}:\d{2}\?/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sin que tengas que volver a reservarla/)).toBeVisible();
    await expect(page.getByText(/Tu estudio tiene que confirmarla/)).toBeVisible();
    await page.getByRole('button', { name: 'Pedir clase fija' }).click();

    await expect(page.getByText(/Ya la has pedido: tu estudio te contestará aquí/)).toBeVisible({ timeout: 30_000 });
    expect(visto.intentos).toBeGreaterThan(0);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza', sesionId: SESION_ID });
  });

  test('con bono no se le ofrece un botón que no va a funcionar: se le dice por qué', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    const visto = await contarPeticiones(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/La clase fija es para quien tiene una cuota activa que incluya esta clase/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Con bono o clases sueltas, se reserva clase a clase/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
    expect(visto.intentos, 'nada sale hacia el servidor').toBe(0);
  });

  test('al terminar de reservar una clase que se repite, se le ofrece hacerla fija', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'cuota');
    const visto = await contarPeticiones(page);
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });

    const oferta = page.getByTestId('oferta-plaza-fija');
    await expect(oferta).toBeVisible();
    await expect(oferta.getByText('¿Vienes cada semana?')).toBeVisible();
    await expect(oferta.getByText(/los miércoles a las \d{2}:\d{2}/)).toBeVisible();
    await oferta.getByRole('button', { name: 'Pedir clase fija' }).click();

    await expect(oferta.getByText('Petición enviada: tu estudio te contestará en la app.')).toBeVisible({ timeout: 30_000 });
    expect(visto.intentos).toBeGreaterThan(0);
    expect(visto.cuerpo).toMatchObject({ accion: 'solicitar_plaza' });
  });

  test('al terminar de reservar con bono no se le ofrece nada de plaza fija', async ({ page }) => {
    await montarClaseQueSeRepite(page, 'bono');
    await page.route('**/api/public/reserva', (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }) });
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^confirmar/i }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('oferta-plaza-fija')).toHaveCount(0);
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

async function montarConClaseFija(page: Page, opts: { reservaAMano?: boolean; masFijas?: number } = {}) {
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
    ...clasesFijas.map((c) => ({ id: c.id, sesionId: c.sesion, socioId: SOCIO_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T00:00:00Z', posicionEspera: null })),
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
    await page.goto(`${base}/bonos`);
    const tarjeta = page.getByTestId('plaza-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText('Tu clase fija', { exact: true })).toBeVisible();
    await expect(tarjeta.getByTestId('plaza-fija-reservada-sola')).toHaveText('Tu plaza está reservada automáticamente cada semana. No necesitas reservar esta clase.');

    // Las tres que el motor le tiene reservadas, y NO la que reservó a mano.
    const proximas = tarjeta.getByTestId('proximas-clases-fijas');
    await expect(proximas.getByText('Próximas clases')).toBeVisible();
    await expect(proximas.getByText('Reservada')).toHaveCount(3);
    await expect(proximas.getByRole('button', { name: 'No puedo asistir' })).toHaveCount(3);
    // Y cómo dejarla o cambiarla: no se hace desde la app, se escribe al estudio.
    await expect(tarjeta.getByRole('link', { name: 'Escribir al estudio' })).toHaveAttribute('href', `${base}/mensajes`);
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

    await page.goto(`${base}/bonos`);
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
