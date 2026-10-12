import { expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Andamiaje de «pagar y reservar sin cuenta» (docs/reserva-sin-login-diseno.md):
// una visitante SIN sesión en una clase que exige plan, con un plan PUNTUAL que
// la cubre. Lo comparten `reservar-pagar-sin-cuenta.spec.ts` y
// `reservar-codigo-descuento.spec.ts`.
//
// ⚠️ La hora: el navegador va en Madrid (`test.use({ timezoneId: 'Europe/Madrid' })`
// en cada spec) y el reloj simulado lleva su offset explícito.
// ─────────────────────────────────────────────────────────────────────────────

export const SLUG = 'tentare';
export const STUDIO_ID = 'studio-test';
export const AHORA = '2026-08-12T08:00:00';
export const SESION_ID = 'ses-puntual';

export function fixtureClaseConPlanPuntual() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
      reservaExigirPlan: true,
      // Necesario para que el paso 'pago' llegue a montarse (studio.stripeAccountId).
      stripeAccountId: 'acct_e2e_dummy',
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Plan PUNTUAL (una sola sesión) que cubre TODOS los tipos (sin tiposClaseIds
    // = cubre todo, mismo criterio que el resto del repo) — es el que
    // planClaseSueltaPara debe encontrar.
    planesTarifa: [
      { id: 'plan-suelto', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 18, sesiones: 1, activo: true },
    ],
    sesiones: [{
      id: SESION_ID, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
      inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false,
    }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [],
    // Visitante SIN sesión — a propósito, es el caso que este flujo cubre.
    socia: null,
  };
}

export async function abrirClaseSinSesion(page: Page) {
  await page.clock.install({ time: new Date(`${AHORA}+02:00`) });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureClaseConPlanPuntual()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));

  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): la tarjeta de la lista ya no abre una hoja de
  // DETALLE intermedia con su propio botón "Reservar" — un tap dispara
  // handleReservarCalendario/openBooking directo. "Tus datos" trae su propia
  // foto/descripción/ubicación, así que la ficha quedaba redundante para
  // este camino.
  //
  // P1-confianza: la fila de plazas habla en plazas LIBRES («10 plazas
  // libres»), nunca en el ratio de panel «0/10 · 10 libres» que la auditoría
  // señaló como confuso («0/10» se leía como «cero plazas»). Se comprueba
  // AQUÍ, en la propia tarjeta (antes de abrir, ya que ahora no hay hoja de
  // detalle intermedia donde repetirlo) — misma protección, mismo texto.
  const tarjeta = page.getByRole('button', { name: /Reformer a las 10:00/ });
  await expect(tarjeta.getByText('10 plazas libres')).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta.getByText('0/10')).not.toBeVisible();

  await tarjeta.click();
}
