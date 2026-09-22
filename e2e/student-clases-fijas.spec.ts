import { test, expect, type Page } from '@playwright/test';
import { AHORA, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Clases fijas del estudio en la app de la alumna: lo que el estudio ofrece, con qué
// clases, cuánto tiempo, y pedirla. Pedirla NO la reserva: el estudio la aprueba.
// Lo que se defiende: que la pantalla diga solo lo que el servidor dijo (el estado
// «pedida» sale de su respuesta, no del toque), que con bono no haya un botón que
// el servidor rechazaría, y que cada camino que escribe lleve su contador de
// intentos (un test de fallo sin contador es hueco: pasa aunque no intente nada).

const base = `/portal/${SLUG}`;

const TZ = 'Europe/Madrid';
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
// «Hoy» para el navegador NO es el reloj real: `sembrarSociaLista` instala un
// reloj fijo en `AHORA` (`page.clock.install`). `Date.now()` real habría dado
// fechas «hoy + N» que el navegador congelado nunca ve como próximas.
const enDias = (n: number) => ymdMadrid(new Date(new Date(AHORA).getTime() + n * 86_400_000));

const OFERTA = {
  id: 'cf-1', nombre: 'Reformer · martes y jueves', descripcion: 'Dos días a la semana para trabajar fuerza y control.',
  estado: 'DISPONIBLE', plazasLibres: 3, programadaHasta: '2027-01-29',
  duraciones: [
    { meses: 1, etiqueta: '1 mes', hasta: '2026-09-12' },
    { meses: 3, etiqueta: '3 meses', hasta: '2026-11-12' },
    { meses: 6, etiqueta: '6 meses', hasta: '2027-02-12' },
  ],
  franjas: [
    { diaSemana: 2, hora: '10:00', tipoClaseId: 'tc-r', salaId: 'sala-1', tipo: 'Reformer', sala: 'Sala 1', instructora: 'Marta' },
    { diaSemana: 4, hora: '18:30', tipoClaseId: 'tc-r', salaId: 'sala-1', tipo: 'Reformer', sala: 'Sala 1', instructora: null },
  ],
};
type Oferta = typeof OFERTA;

interface Pedida { claseFijaId: string; solicitudId: string; duracionMeses: number; hasta: string; tipo?: 'CREAR_CLASE_FIJA' | 'AMPLIAR_CLASE_FIJA' }

interface Montaje {
  catalogo: { ofertas: Oferta[]; pedidas: Pedida[] };
  /** Lo que contesta el servidor a `plaza-fija`. */
  respuesta: { status: number; body: unknown };
  peticiones: Record<string, unknown>[];
  pedidosCatalogo: number;
}

type PlazaFijaMin = { diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null };

async function montar(page: Page, opts: {
  plan?: 'cuota' | 'bono'; catalogo?: Montaje['catalogo'] | 'roto'; respuesta?: Montaje['respuesta']; plazasFijas?: PlazaFijaMin[];
} = {}): Promise<Montaje> {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  if (opts.plazasFijas) (f.socia as Record<string, unknown>).plazasFijas = opts.plazasFijas;
  if (opts.plan === 'cuota') {
    f.planesTarifa = [{ id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual', tipo: 'MENSUAL', sesiones: null, precio: 60, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-c', socioId: SOCIO_ID, planId: 'plan-cuota', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null },
    ];
  }
  if (opts.plan === 'bono') {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-b', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  const m: Montaje = {
    catalogo: opts.catalogo && opts.catalogo !== 'roto' ? opts.catalogo : { ofertas: [OFERTA], pedidas: [] },
    respuesta: opts.respuesta ?? { status: 200, body: { ok: true, solicitudId: 'spf-9' } },
    peticiones: [], pedidosCatalogo: 0,
  };
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/api/public/clases-fijas', (r) => {
    m.pedidosCatalogo++;
    // Una respuesta con otra forma (`{}`): la app no puede dar por hecha la forma.
    return opts.catalogo === 'roto'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m.catalogo) });
  });
  await page.route('**/api/public/plaza-fija', (r) => {
    m.peticiones.push(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
    return r.fulfill({ status: m.respuesta.status, contentType: 'application/json', body: JSON.stringify(m.respuesta.body) });
  });
  return m;
}

test.describe('Student PWA · clases fijas del estudio', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('en el horario hay una puerta a las clases fijas solo si el estudio ofrece alguna', async ({ page }) => {
    await montar(page, { plan: 'cuota' });
    await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
    const entrada = page.getByTestId('entrada-clases-fijas');
    await expect(entrada).toBeVisible({ timeout: 30_000 });
    await expect(entrada).toContainText('Tu sitio reservado cada semana');
    await entrada.click();
    await expect(page).toHaveURL(new RegExp(`${base}/clases-fijas$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Reformer · martes y jueves' })).toBeVisible({ timeout: 30_000 });
  });

  test('sin clases fijas, o con una respuesta rota, el horario queda como estaba', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota', catalogo: { ofertas: [], pedidas: [] } });
    await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => m.pedidosCatalogo, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('entrada-clases-fijas')).toHaveCount(0);

    const roto = await montar(page, { plan: 'cuota', catalogo: 'roto' });
    await page.goto(`${base}/reservar`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => roto.pedidosCatalogo, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('entrada-clases-fijas')).toHaveCount(0);
  });

  test('con cuota: dice qué incluye y hasta cuándo llega cada duración, y al pedirla queda pedida con lo que confirmó el servidor', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota' });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    const tarjeta = page.getByTestId('clase-fija');
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta).toContainText('Los martes y jueves');
    await expect(tarjeta).toContainText(/martes 10:00/i);
    await expect(tarjeta).toContainText(/jueves 18:30/i);
    await expect(tarjeta).toContainText('Quedan 3 plazas');
    await expect(tarjeta).toContainText('Hay clases programadas hasta el 29/01/2027');
    await expect(page.getByText(/tu estudio la revisa/i)).toBeVisible();

    // Cada duración enseña la fecha a la que llega.
    await expect(page.getByTestId('clase-fija-hasta')).toHaveText('Hasta el 12/09/2026');
    await page.getByRole('button', { name: '3 meses' }).click();
    await expect(page.getByTestId('clase-fija-hasta')).toHaveText('Hasta el 12/11/2026');

    // Al confirmar el servidor, la lista que vuelve trae su petición.
    m.catalogo = { ofertas: [OFERTA], pedidas: [{ claseFijaId: 'cf-1', solicitudId: 'spf-9', duracionMeses: 3, hasta: '2026-11-12', tipo: 'CREAR_CLASE_FIJA' as const }] };
    await page.getByRole('button', { name: 'Pedir clase fija' }).click();

    await expect(page.getByTestId('clase-fija-pedida')).toHaveText('Ya la has pedido (hasta el 12/11/2026): tu estudio te contestará aquí.', { timeout: 30_000 });
    expect(m.peticiones.length, 'la petición sale hacia el servidor').toBeGreaterThan(0);
    expect(m.peticiones[0]).toMatchObject({ accion: 'solicitar_clase_fija', studioId: STUDIO_ID, claseFijaId: 'cf-1', duracionMeses: 3 });
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
  });

  test('con bono no hay un botón que el servidor rechazaría: se le dice por qué y no sale nada', async ({ page }) => {
    const m = await montar(page, { plan: 'bono' });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('clase-fija-sin-cuota')).toContainText('La clase fija es para quien tiene una cuota activa', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver las cuotas' })).toBeVisible();
    expect(m.peticiones, 'nada sale hacia el servidor').toHaveLength(0);
  });

  test('si el servidor dice que no, la app no dice que sí', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota', respuesta: { status: 409, body: { error: 'Esta clase fija está completa.' } } });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Pedir clase fija' }).click({ timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Esta clase fija está completa.' })).toBeVisible({ timeout: 30_000 });
    expect(m.peticiones.length, 'el camino de fallo sí intentó pedirla').toBeGreaterThan(0);
    await expect(page.getByTestId('clase-fija-pedida')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toBeVisible();
  });

  test('si se cae la red al pedirla, no dice que se ha enviado', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota' });
    await page.route('**/api/public/plaza-fija', (r) => { m.peticiones.push({ caida: true }); return r.abort('failed'); });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Pedir clase fija' }).click({ timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'no sabemos si se ha enviado' })).toBeVisible({ timeout: 30_000 });
    expect(m.peticiones.length).toBeGreaterThan(0);
    await expect(page.getByTestId('clase-fija-pedida')).toHaveCount(0);
  });

  test('una petición ya enviada se puede anular, y vuelve el botón', async ({ page }) => {
    const m = await montar(page, {
      plan: 'cuota',
      catalogo: { ofertas: [OFERTA], pedidas: [{ claseFijaId: 'cf-1', solicitudId: 'spf-9', duracionMeses: 3, hasta: '2026-11-12', tipo: 'CREAR_CLASE_FIJA' as const }] },
      respuesta: { status: 200, body: { ok: true } },
    });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('clase-fija-pedida')).toBeVisible({ timeout: 30_000 });
    m.catalogo = { ofertas: [OFERTA], pedidas: [] };
    await page.getByRole('button', { name: 'Anular la petición' }).click();
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toBeVisible({ timeout: 30_000 });
    expect(m.peticiones.length).toBeGreaterThan(0);
    expect(m.peticiones[0]).toMatchObject({ accion: 'cancelar_peticion', solicitudId: 'spf-9' });
  });

  test('completa o sin clases: se dice y no hay botón', async ({ page }) => {
    await montar(page, { plan: 'cuota', catalogo: { ofertas: [{ ...OFERTA, estado: 'COMPLETA', plazasLibres: 0 }, { ...OFERTA, id: 'cf-2', nombre: 'Mat · lunes', estado: 'SIN_CLASES', plazasLibres: null }], pedidas: [] } });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Esta clase fija está completa.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ahora no hay clases programadas en este horario.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pedir clase fija' })).toHaveCount(0);
  });

  test('sin ninguna clase fija la pantalla lo dice, no queda en blanco', async ({ page }) => {
    await montar(page, { plan: 'cuota', catalogo: { ofertas: [], pedidas: [] } });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Tu estudio todavía no tiene clases fijas.')).toBeVisible({ timeout: 30_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2: cuando ya la tiene entera y le quedan pocos días, puede ampliarla antes
// de perder el sitio. `venceEl`/`ampliacionPedida` los deriva la propia pantalla
// (`proyectarClasesFijas`) de `socia.plazasFijas`, que ya viaja en el catálogo —
// por eso aquí se siembra directamente esa lista, no se mockea un endpoint nuevo.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Student PWA · clases fijas del estudio · ampliar antes de vencer', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: TZ });

  const plazaDe = (f: Oferta['franjas'][number], vigenciaHasta: string): PlazaFijaMin => ({
    diaSemana: f.diaSemana, horaInicio: `${f.hora}:00`, salaId: f.salaId, tipoClaseId: f.tipoClaseId, estado: 'ACTIVA', vigenciaHasta,
  });
  const cubriendoAmbas = (vigenciaHasta: string) => OFERTA.franjas.map((f) => plazaDe(f, vigenciaHasta));

  test('le queda poco: ve cuándo termina y, al ampliarla, queda pedida con lo que confirmó el servidor', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota', plazasFijas: cubriendoAmbas(enDias(5)) });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    const tarjeta = page.getByTestId('clase-fija');
    await expect(tarjeta).toContainText('La tienes ✓', { timeout: 30_000 });
    await expect(tarjeta).toContainText('Ya tienes esta clase fija.');
    await expect(page.getByTestId('clase-fija-vence')).toHaveText(`Termina el ${enDias(5).split('-').reverse().join('/')}`);
    await expect(page.getByRole('group', { name: '¿Cuánto tiempo más la quieres?' })).toBeVisible();

    m.catalogo = { ofertas: [OFERTA], pedidas: [{ claseFijaId: 'cf-1', solicitudId: 'spf-amp-1', duracionMeses: 3, hasta: '2026-12-05', tipo: 'AMPLIAR_CLASE_FIJA' }] };
    await page.getByRole('button', { name: '3 meses' }).click();
    await page.getByRole('button', { name: 'Ampliar' }).click();

    await expect(page.getByTestId('clase-fija-ampliacion-pedida')).toHaveText('Has pedido ampliarla (hasta el 05/12/2026): tu estudio te contestará aquí.', { timeout: 30_000 });
    expect(m.peticiones.length, 'la petición sale hacia el servidor').toBeGreaterThan(0);
    expect(m.peticiones[0]).toMatchObject({ accion: 'ampliar_clase_fija', studioId: STUDIO_ID, claseFijaId: 'cf-1', duracionMeses: 3 });
    await expect(page.getByRole('button', { name: 'Ampliar' })).toHaveCount(0);
  });

  test('si le queda mucho tiempo, se dice cuándo termina pero no se ofrece ampliar', async ({ page }) => {
    const m = await montar(page, { plan: 'cuota', plazasFijas: cubriendoAmbas(enDias(90)) });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    const tarjeta = page.getByTestId('clase-fija');
    await expect(tarjeta).toContainText('La tienes ✓', { timeout: 30_000 });
    await expect(page.getByTestId('clase-fija-vence')).toHaveText(`Termina el ${enDias(90).split('-').reverse().join('/')}`);
    await expect(page.getByRole('button', { name: 'Ampliar' })).toHaveCount(0);
    expect(m.peticiones).toHaveLength(0);
  });

  test('una ampliación ya pedida se puede anular, y vuelve el selector de duración', async ({ page }) => {
    const m = await montar(page, {
      plan: 'cuota', plazasFijas: cubriendoAmbas(enDias(5)),
      catalogo: { ofertas: [OFERTA], pedidas: [{ claseFijaId: 'cf-1', solicitudId: 'spf-amp-2', duracionMeses: 3, hasta: '2026-12-05', tipo: 'AMPLIAR_CLASE_FIJA' }] },
      respuesta: { status: 200, body: { ok: true } },
    });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('clase-fija-ampliacion-pedida')).toBeVisible({ timeout: 30_000 });

    m.catalogo = { ofertas: [OFERTA], pedidas: [] };
    await page.getByRole('button', { name: 'Anular la petición' }).click();
    await expect(page.getByRole('button', { name: 'Ampliar' })).toBeVisible({ timeout: 30_000 });
    expect(m.peticiones[0]).toMatchObject({ accion: 'cancelar_peticion', solicitudId: 'spf-amp-2' });
  });

  test('si el servidor no puede ampliarla, no dice que sí', async ({ page }) => {
    const m = await montar(page, {
      plan: 'cuota', plazasFijas: cubriendoAmbas(enDias(5)),
      respuesta: { status: 409, body: { error: 'Ya no puede ampliarse: revisa su cuota.' } },
    });
    await page.goto(`${base}/clases-fijas`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ampliar' }).click({ timeout: 30_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Ya no puede ampliarse: revisa su cuota.' })).toBeVisible({ timeout: 30_000 });
    expect(m.peticiones.length, 'el camino de fallo sí intentó ampliar').toBeGreaterThan(0);
    await expect(page.getByTestId('clase-fija-ampliacion-pedida')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ampliar' })).toBeVisible();
  });
});
