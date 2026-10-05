import { test, expect, type Page } from '@playwright/test';
import { SESION_ID, SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// «Avisos» de la app de la alumna (rediseño aprobado del 5-oct-2026): por días,
// con filtros, su icono, y el botón cuando el aviso pide algo y existe la vía.
//
// Lo que se defiende: que los botones hagan lo MISMO que en Mis clases (aceptar la
// plaza por /api/public/aceptar-oferta-espera; salir de la lista con confirmación)
// y que lo que se dice después sea lo que contestó el servidor. Siempre con
// contador de peticiones: un test de fallo sin contador puede salir verde sin
// haber intentado nada.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** El reloj es el 12-ago-2026 a las 08:00 DE MADRID (`relojMadrid`): las horas de abajo llevan su desfase. */
const OFERTA_HASTA = '2026-08-12T08:30:00+02:00';

const aviso = (id: string, evento: string, categoria: string, creado: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, title: titulo, body: `Cuerpo de ${titulo}`, category: categoria, eventType: evento, createdAt: creado, readAt: null, ...extra,
});

/**
 * El «servidor» de la prueba: su reserva en espera de la clase del aviso, que el
 * test CAMBIA tras cada escritura, como el de verdad (aceptar la deja CONFIRMADA;
 * salir de la lista, CANCELADA). Sin eso, un resultado que se borra al recargar
 * pasaba verde porque la recarga devolvía lo mismo de antes.
 */
interface Servidor { reserva: { estado: string; ofertaExpiraEn: string | null } | null; lecturas: number }

async function montar(page: Page, opts: { avisos: unknown[]; ofertaExpiraEn?: string | null }): Promise<Servidor> {
  await sembrarSociaLista(page, { relojMadrid: true });
  const servidor: Servidor = {
    reserva: opts.ofertaExpiraEn !== undefined ? { estado: 'LISTA_ESPERA', ofertaExpiraEn: opts.ofertaExpiraEn } : null,
    lecturas: 0,
  };
  await page.route('**/api/public/studio-data', (r) => {
    servidor.lecturas++;
    const f = fixtureSociaLista();
    if (servidor.reserva) {
      (f.socia.reservas as unknown[]).push({
        id: 'res-espera', sesionId: SESION_ID, socioId: SOCIO_ID, estado: servidor.reserva.estado, creadoEn: '2026-08-10T09:00:00Z',
        posicionEspera: servidor.reserva.estado === 'LISTA_ESPERA' ? 1 : null,
        ofertaExpiraEn: servidor.reserva.estado === 'LISTA_ESPERA' ? servidor.reserva.ofertaExpiraEn : null,
      });
    }
    return r.fulfill(json(f));
  });
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: opts.avisos, unread: opts.avisos.length })));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill(json({ posts: [] })));
  return servidor;
}

const ofertaAviso = aviso('n-oferta', 'reserva.oferta_lista_espera', 'reservas', '2026-08-12T07:55:00+02:00', 'Se ha liberado una plaza', { resourceType: 'sesion', resourceId: SESION_ID });

test.describe('Student PWA · Avisos', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('por días (Hoy, Ayer, Esta semana, Antes), cada uno con su icono, y los filtros dejan solo lo suyo', async ({ page }) => {
    await montar(page, {
      avisos: [
        aviso('n1', 'reserva.confirmada', 'reservas', '2026-08-12T07:15:00+02:00', 'Reserva confirmada', { resourceType: 'sesion', resourceId: 'otra' }),
        aviso('n2', 'bono.por_caducar', 'pagos', '2026-08-11T19:00:00+02:00', 'Tu bono está por caducar'),
        aviso('n3', 'comunidad.post_nuevo', 'marketing', '2026-08-10T12:00:00+02:00', 'Novedad en el tablón'),
        aviso('n4', 'clase.sustituta', 'clases', '2026-08-03T10:00:00+02:00', 'Tu clase sigue en pie'),
      ],
    });
    await page.goto(`${base}/notificaciones`);
    await expect(page.getByRole('heading', { name: 'Avisos', exact: true })).toBeVisible({ timeout: 30_000 });
    for (const [grupo, titulo] of [['Hoy', 'Reserva confirmada'], ['Ayer', 'Tu bono está por caducar'], ['Esta semana', 'Novedad en el tablón'], ['Antes', 'Tu clase sigue en pie']]) {
      await expect(page.getByRole('region', { name: grupo, exact: true })).toContainText(titulo);
    }
    // El cambio de profesora (aviso de sustituta) lleva el icono de instructoras.
    await expect(page.locator('[data-testid="aviso"][data-evento="clase.sustituta"] [data-icono="instructoras"]')).toHaveCount(1);
    // Sin leer: el punto, no un fondo.
    await expect(page.getByLabel('Sin leer', { exact: true })).toHaveCount(4);

    await page.getByRole('button', { name: 'Pagos' }).click();
    await expect(page.getByRole('button', { name: 'Pagos' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('aviso')).toHaveCount(1);
    await expect(page.getByTestId('aviso')).toContainText('Tu bono está por caducar');
    // El bono que se acaba lleva «Renovar», a Bonos.
    await expect(page.getByRole('link', { name: 'Renovar' })).toHaveAttribute('href', `${base}/bonos`);

    await page.getByRole('button', { name: 'Reservas' }).click();
    await expect(page.getByTestId('aviso')).toHaveCount(2);
    await page.getByRole('button', { name: 'Del estudio' }).click();
    await expect(page.getByTestId('aviso')).toHaveCount(1);
    await expect(page.getByTestId('aviso')).toContainText('Novedad en el tablón');
    await page.getByRole('button', { name: 'Todo' }).click();
    await expect(page.getByTestId('aviso')).toHaveCount(4);
  });

  test('un filtro sin nada lo dice, en vez de una pantalla en blanco', async ({ page }) => {
    await montar(page, { avisos: [aviso('n1', 'reserva.confirmada', 'reservas', '2026-08-12T07:15:00+02:00', 'Reserva confirmada')] });
    await page.goto(`${base}/notificaciones`);
    await page.getByRole('button', { name: 'Pagos' }).click({ timeout: 30_000 });
    await expect(page.getByTestId('avisos-filtro-vacio')).toHaveText('Nada en «Pagos» por ahora.');
  });

  test('«Aceptar la plaza»: UNA petición por la vía de Mis clases, y lo que contestó el servidor SIGUE tras recargar', async ({ page }) => {
    const servidor = await montar(page, { avisos: [ofertaAviso], ofertaExpiraEn: OFERTA_HASTA });
    const cuerpos: Record<string, unknown>[] = [];
    await page.route('**/api/public/aceptar-oferta-espera', (r) => {
      cuerpos.push(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
      servidor.reserva = { estado: 'CONFIRMADA', ofertaExpiraEn: null };
      return r.fulfill(json({ ok: true, estado: 'CONFIRMADA' }));
    });
    await page.goto(`${base}/notificaciones`);
    const oferta = page.getByTestId('aviso-oferta');
    await expect(oferta).toContainText('Tienes hasta las 08:30 · quedan 30 min', { timeout: 30_000 });
    expect(cuerpos, 'ver el aviso no acepta nada').toHaveLength(0);

    const antes = servidor.lecturas;
    await oferta.getByRole('button', { name: 'Aceptar la plaza' }).click();
    await expect(page.getByTestId('aviso-resuelto')).toHaveText('Plaza confirmada.', { timeout: 30_000 });
    expect(cuerpos).toHaveLength(1);
    expect(cuerpos[0]).toMatchObject({ studioId: STUDIO_ID, reservaId: 'res-espera' });
    expect(Object.keys(cuerpos[0]), 'la socia la saca el servidor de su sesión').not.toContain('socioId');
    // Ya ha vuelto a leer sus reservas (ahora CONFIRMADA, sin oferta) y el resultado sigue ahí.
    await expect.poll(() => servidor.lecturas, { timeout: 30_000 }).toBeGreaterThan(antes);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('aviso-resuelto')).toHaveText('Plaza confirmada.');
    await expect(page.getByRole('button', { name: 'Aceptar la plaza' })).toHaveCount(0);
  });

  test('si el servidor dice que no (4xx), no se dice que sí: se ve el motivo y no hay «Plaza confirmada»', async ({ page }) => {
    const servidor = await montar(page, { avisos: [ofertaAviso], ofertaExpiraEn: OFERTA_HASTA });
    let intentos = 0;
    await page.route('**/api/public/aceptar-oferta-espera', (r) => {
      intentos++;
      // Como la RPC de verdad: un fallo al aceptar la deja sin el sitio.
      servidor.reserva = { estado: 'CANCELADA', ofertaExpiraEn: null };
      return r.fulfill(json({ error: 'Esa plaza ya no está disponible.' }, 409));
    });
    await page.goto(`${base}/notificaciones`);
    await page.getByTestId('aviso-oferta').getByRole('button', { name: 'Aceptar la plaza' }).click({ timeout: 30_000 });
    await expect(page.getByText('Esa plaza ya no está disponible.')).toBeVisible({ timeout: 30_000 });
    expect(intentos, 'la petición salió de verdad').toBeGreaterThan(0);
    await expect(page.getByTestId('aviso-resuelto')).toHaveCount(0);
  });

  test('«No, gracias» pide confirmación antes de salir de la lista, sale con UNA petición, y lo dice también tras recargar', async ({ page }) => {
    const servidor = await montar(page, { avisos: [ofertaAviso], ofertaExpiraEn: OFERTA_HASTA });
    const cancelaciones: Record<string, unknown>[] = [];
    await page.route('**/api/public/reserva', (r) => {
      cancelaciones.push(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
      servidor.reserva = { estado: 'CANCELADA', ofertaExpiraEn: null };
      return r.fulfill(json({ ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: false, recuperacionCreada: false }));
    });
    await page.goto(`${base}/notificaciones`);
    await page.getByTestId('aviso-oferta').getByRole('button', { name: 'No, gracias' }).click({ timeout: 30_000 });
    await expect(page.getByText('¿Salir de la lista de espera?')).toBeVisible();
    expect(cancelaciones, 'abrir la confirmación no cancela nada').toHaveLength(0);
    const antes = servidor.lecturas;
    await page.getByRole('button', { name: 'Sí, salir' }).click();
    await expect(page.getByTestId('aviso-resuelto')).toHaveText('Has salido de la lista de espera', { timeout: 30_000 });
    expect(cancelaciones).toHaveLength(1);
    expect(cancelaciones[0]).toMatchObject({ accion: 'cancelar', reservaId: 'res-espera' });
    await expect.poll(() => servidor.lecturas, { timeout: 30_000 }).toBeGreaterThan(antes);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('aviso-resuelto')).toHaveText('Has salido de la lista de espera');
  });

  test('una oferta caducada lo dice, y el botón no se puede pulsar', async ({ page }) => {
    await montar(page, { avisos: [ofertaAviso], ofertaExpiraEn: '2026-08-12T07:59:00+02:00' });
    let intentos = 0;
    await page.route('**/api/public/aceptar-oferta-espera', (r) => { intentos++; return r.fulfill(json({ ok: true, estado: 'CONFIRMADA' })); });
    await page.goto(`${base}/notificaciones`);
    const oferta = page.getByTestId('aviso-oferta');
    await expect(oferta).toContainText('Se acabó el plazo para aceptar esta plaza.', { timeout: 30_000 });
    await expect(oferta.getByRole('button', { name: 'Aceptar la plaza' })).toBeDisabled();
    await expect(oferta.getByRole('button', { name: 'No, gracias' })).toHaveCount(0);
    expect(intentos).toBe(0);
  });

  test('al caducar mientras se mira, el botón se desactiva EN ESE MOMENTO (no un minuto después)', async ({ page }) => {
    // Caduca a las 08:00:40; el reloj de la app cambia al empezar el minuto, que aquí sería 08:01.
    await montar(page, { avisos: [ofertaAviso], ofertaExpiraEn: '2026-08-12T08:00:40+02:00' });
    let intentos = 0;
    await page.route('**/api/public/aceptar-oferta-espera', (r) => { intentos++; return r.fulfill(json({ ok: true, estado: 'CONFIRMADA' })); });
    await page.goto(`${base}/notificaciones`);
    const oferta = page.getByTestId('aviso-oferta');
    await expect(oferta).toContainText('quedan 1 min', { timeout: 30_000 });
    await expect(oferta.getByRole('button', { name: 'Aceptar la plaza' })).toBeEnabled();
    await page.clock.fastForward(45_000);
    await expect(oferta).toContainText('Se acabó el plazo para aceptar esta plaza.');
    await expect(oferta.getByRole('button', { name: 'Aceptar la plaza' })).toBeDisabled();
    expect(intentos).toBe(0);
  });
});
