import { test, expect, type Page, type Route } from '@playwright/test';

// P04, la parte de la amiga (5-oct-2026): el enlace de «Compartir esta clase» abre ESA clase en la página pública
// (`?sesion=`) y dice quién invita (`?invita=`). Si la amiga es nueva y crea su cuenta con ese enlace, su alta lleva
// `referidoPor` y el premio se paga cuando venga a su primera clase (`decidirPremioReferido`).
//
// ⚠️ Lo que se prueba aquí es lo que hace el NAVEGADOR: guardar el `invita` para el viaje por el correo, mandarlo en el
// alta y no mandar basura. La comprobación de verdad (que esa ficha exista en el MISMO estudio) la hace el servidor
// (/api/public/socio), que descarta en silencio lo que no cuadre. Cada camino que escribe lleva su contador.
//
// Pantalla pública que sufre alguien de fuera: también corre en WebKit (`webkit-publico`).

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';
const SESION = 'ses-r';
const AMIGA = 'socio-amiga';

const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

function fixture() {
  return {
    studio: { id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1', email: 'hola@example.com', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12 },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [],
    sesiones: [{ id: SESION, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function base(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', (r) => json(r, { id: STUDIO_ID }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }));
  await page.route('**/api/public/studio-data', (r) => json(r, fixture()));
}

/** Autenticada por el correo pero SIN ficha en este estudio: la amiga nueva que vuelve del enlace. */
async function amigaSinFicha(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'u-amiga', email: 'amiga@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.route('**/api/public/session', (r) => json(r, {}, 404));
}

/** El alta (`registrar`) con su contador; las demás acciones de /api/public/socio, bien. */
async function altas(page: Page, status = 200) {
  const cuerpos: Array<{ referidoPor?: string | null }> = [];
  await page.route('**/api/public/socio', (r) => {
    const b = r.request().postDataJSON() as { accion?: string; referidoPor?: string | null };
    if (b?.accion === 'registrar') {
      cuerpos.push(b);
      return status === 200 ? json(r, { ok: true }) : json(r, { error: 'No se ha podido crear tu ficha.' }, status);
    }
    return json(r, { ok: true });
  });
  return cuerpos;
}

/** De la ficha de invitación al alta con la clase: nombre, términos y confirmar. */
async function darseDeAlta(page: Page, query: string) {
  await page.goto(`/reservar/${SLUG}?${query}`);
  await page.getByRole('button', { name: 'Reservar mi plaza' }).click({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Tu nombre completo').fill('Amiga');
  await page.getByPlaceholder(/Tu teléfono/).fill('+34 600 000 000');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await page.getByRole('checkbox', { name: /términos de servicio/ }).check();
  await page.getByRole('button', { name: /Aceptar y continuar/ }).click();
  await page.getByRole('button', { name: /confirmar reserva/i }).click({ timeout: 30_000 });
}

test.describe('Reservar · invitar a una amiga a ESA clase', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sin sesión, el enlace abre la ficha de esa clase (no el horario entero)', async ({ page }) => {
    await base(page);
    await page.route('**/api/public/session', (r) => json(r, {}, 401));
    await page.goto(`/reservar/${SLUG}?sesion=${SESION}&invita=${AMIGA}`);
    await expect(page.getByRole('button', { name: 'Reservar mi plaza' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Mis reservas' })).not.toBeVisible();
  });

  test('la amiga nueva que se da de alta desde el enlace queda apuntada como invitada', async ({ page }) => {
    await base(page);
    await amigaSinFicha(page);
    const cuerpos = await altas(page);
    await page.route('**/api/public/reserva', (r) => json(r, { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }));
    await darseDeAlta(page, `sesion=${SESION}&invita=${AMIGA}`);
    await expect.poll(() => cuerpos.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(cuerpos[0].referidoPor).toBe(AMIGA);
  });

  test('si el alta falla, se dice y no se sigue a la reserva', async ({ page }) => {
    await base(page);
    await amigaSinFicha(page);
    const cuerpos = await altas(page, 400);
    let reservas = 0;
    await page.route('**/api/public/reserva', (r) => { reservas += 1; return json(r, { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }); });
    await darseDeAlta(page, `sesion=${SESION}&invita=${AMIGA}`);
    await expect.poll(() => cuerpos.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Se queda en el paso de confirmar (con su aviso), sin anunciar nada ni reservar a nombre de nadie.
    await expect(page.getByRole('button', { name: /confirmar reserva/i })).toBeVisible();
    await expect(page.getByText(/reserva confirmada/i)).toHaveCount(0);
    expect(reservas, 'con el alta rechazada no se puede reservar a su nombre').toBe(0);
  });

  test('un `invita` con forma rota no viaja: el alta sale igual, sin referidor', async ({ page }) => {
    await base(page);
    await amigaSinFicha(page);
    const cuerpos = await altas(page);
    await page.route('**/api/public/reserva', (r) => json(r, { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' }));
    await darseDeAlta(page, `sesion=${SESION}&invita=${encodeURIComponent('../../etc/passwd')}`);
    await expect.poll(() => cuerpos.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(cuerpos[0].referidoPor ?? null).toBeNull();
  });

  test('sin sesión, el correo para entrar vuelve con quién invita', async ({ page }) => {
    await base(page);
    await page.route('**/api/public/session', (r) => json(r, {}, 401));
    const envios: string[] = [];
    await page.route('**/auth/v1/otp*', (r) => {
      envios.push(r.request().url());
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    });
    await page.goto(`/reservar/${SLUG}?sesion=${SESION}&invita=${AMIGA}`);
    await page.getByRole('button', { name: 'Reservar mi plaza' }).click({ timeout: 45_000 });
    await page.getByPlaceholder(/tu email/i).fill('amiga@example.com');
    await page.getByRole('button', { name: /continuar/i }).click();
    await expect.poll(() => envios.length, { timeout: 30_000 }).toBeGreaterThan(0);
    const vuelta = new URL(envios[0]).searchParams.get('redirect_to') ?? '';
    expect(new URL(vuelta).searchParams.get('invita')).toBe(AMIGA);
  });
});
