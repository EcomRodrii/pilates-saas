import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Mis reservas» en /reservar (29-sep-2026):
//
//   · Una plaza ofrecida de la lista de espera (Fase 2b: `ofertaExpiraEn`) se
//     acepta desde aquí. Antes solo se podía desde la ficha de la clase: quien
//     abría sus reservas veía «Lista de espera · 2ª» con la plaza ya ofrecida y
//     el reloj corriendo, sin ningún botón.
//   · Sin ventana de cancelación configurada (0 h), la confirmación no promete
//     nada. Antes decía «Es gratis hasta 0h antes».
//
// El camino de fallo lleva su contador: un «no se aceptó» que no ha pedido
// nada no demuestra nada (e2e/socia-lista.ts, CLAUDE.md).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

const S = 'studio-test';
const SOCIO_ID = 'socio-e2e-p3';
const MOVIL = { width: 390, height: 844 };
const AHORA = '2026-08-12T08:00:00+02:00';

function fx(opc: { ventana: number }) {
  const ses = (id: string, dia: string, h: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-${dia}T${h}:00:00+02:00`, fin: `2026-08-${dia}T${h}:50:00+02:00`, aforoMaximo: 10, cancelada: false,
  });
  const reservas = [
    { id: 'res-1', studioId: S, socioId: SOCIO_ID, sesionId: 'ses-10', estado: 'CONFIRMADA', spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-08-01T09:00:00Z' },
    // Plaza ofrecida hasta las 08:30 de hoy (hora del estudio).
    { id: 'res-2', studioId: S, socioId: SOCIO_ID, sesionId: 'ses-20', estado: 'LISTA_ESPERA', spotId: null, posicionEspera: 1, ofertaExpiraEn: '2026-08-12T08:30:00+02:00', checkInEn: null, creadoEn: '2026-08-02T09:00:00Z' },
  ];
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: 'tentare', ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@example.com', telefono: '+34 600 111 222', cancelacionVentanaHoras: opc.ventana,
      colorPrimario: '#2C352C',
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala Reformer', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Marta Vidal', rol: 'INSTRUCTOR', activo: true }],
    spots: [], planesTarifa: [],
    sesiones: [ses('ses-10', '12', '10'), ses('ses-20', '12', '18')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [],
    challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    // Las de la socia van TAMBIÉN en el aforo, con el mismo id (lib/studio-context.tsx).
    aforoReservas: reservas.map(r => ({ id: r.id, sesion_id: r.sesionId, estado: r.estado })),
    socia: {
      socio: {
        id: SOCIO_ID, studioId: S, nombre: 'Socia', apellidos: 'Prueba', email: 'socia-p3@example.com',
        aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null },
      },
      reservas, plazasFijas: [], recibos: [], suscripciones: [],
    },
  };
}

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page, opc: { ventana: number }) {
  await page.setViewportSize(MOVIL);
  await page.clock.install({ time: new Date(AHORA) });
  const f = fx(opc);
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route('**/api/**', (r) => r.fulfill(json({})));
  await page.route('**/rest/v1/**', (r) => r.fulfill({ ...json({ id: S }), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/theme**', (r) => r.fulfill(json({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 })));
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route('**/api/public/aforo**', (r) => r.fulfill(json({ sesionIds: f.sesiones.map(s => s.id), aforoReservas: f.aforoReservas })));
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: 'socia-p3@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.route('**/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Socia Prueba', email: 'socia-p3@example.com' })));
  await page.goto('/reservar/tentare?tab=clases');
  await page.locator('.reserva-slot-row').first().waitFor({ timeout: 150_000 });
  await page.waitForTimeout(900);
}

async function abrirMisReservas(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Más secciones' }).click();
  await page.getByRole('menu', { name: 'Más secciones' }).getByRole('menuitem', { name: /Mis reservas/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Mis reservas' })).toBeVisible();
}

test('una plaza ofrecida se acepta desde «Mis reservas»; si el servidor dice que no, se dice y se puede reintentar', async ({ page }) => {
  await montar(page, { ventana: 12 });
  // Después del andamiaje: registrada antes, la red de seguridad la taparía.
  let intentos = 0;
  let responder = { status: 409, cuerpo: { error: 'La oferta ya no está disponible' } as Record<string, unknown> };
  await page.route('**/api/reservas/aceptar-oferta-espera', (r) => {
    intentos++;
    return r.fulfill(json(responder.cuerpo, responder.status));
  });
  await abrirMisReservas(page);

  const tarjeta = page.getByRole('article').filter({ hasText: 'Hoy · 18:00' });
  await expect(tarjeta.getByText('Plaza para ti', { exact: true })).toBeVisible();
  await expect(tarjeta).toContainText('¡Se ha liberado una plaza! Tienes hasta las 08:30 para aceptarla.');
  const aceptar = tarjeta.getByRole('button', { name: 'Aceptar plaza' });

  await aceptar.click();
  await expect(tarjeta.getByRole('alert')).toBeVisible();
  expect(intentos).toBeGreaterThan(0);
  // Nada de optimismo: sigue sin ser suya, y el botón vuelve a poder pulsarse.
  await expect(tarjeta.getByText('Plaza para ti', { exact: true })).toBeVisible();
  await expect(aceptar).toBeEnabled();

  responder = { status: 200, cuerpo: { ok: true } };
  await aceptar.click();
  await expect.poll(() => intentos).toBe(2);
  await expect(tarjeta.getByRole('alert')).toHaveCount(0);
});

test('sin ventana de cancelación, la confirmación no promete «gratis hasta 0h antes»', async ({ page }) => {
  await montar(page, { ventana: 0 });
  let cancelaciones = 0;
  await page.route('**/api/public/reserva', (r) => { cancelaciones++; return r.fulfill(json({ ok: true })); });
  await abrirMisReservas(page);
  const tarjeta = page.getByRole('article').filter({ hasText: 'Hoy · 10:00' });
  await tarjeta.getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(tarjeta).toContainText('¿Quieres cancelar esta reserva?');
  await expect(tarjeta).not.toContainText('0h');
  await tarjeta.getByRole('button', { name: 'No, mantener' }).click();
  await page.waitForTimeout(300);
  expect(cancelaciones).toBe(0);
});
