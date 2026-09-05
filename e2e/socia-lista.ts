import { expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Socia lista para reservar» — el andamiaje mínimo para que un clic en
// /reservar ESCRIBA de verdad, en vez de derivar al modal de acceso.
//
// ⚠️ Existe porque montarlo mal da tests que salen VERDES sin probar nada. En
// `/reservar`, `handleReservarCalendario` deriva a `openBooking()` salvo que se
// cumplan TRES cosas a la vez, y basta que falte una para que la petición no
// salga jamás:
//
//   1. `autenticado` → sesión de portal en `localStorage` (`sb-portal-auth`)
//      MÁS `/api/public/session` respondiendo 200 con el `socioId`.
//   2. `socio.aceptacionContrato` presente. Ojo: el contrato se busca en
//      `socios`, que en modo público es literalmente `[socia.socio]`
//      (`setSocios(socia ? [socia.socio] : [])`), así que va DENTRO de
//      `socia.socio` y no en ningún otro sitio.
//   3. `evaluarGate()` en falso → sin plan exigido y sin ventana que incumplir.
//
// Un test que use esto y aun así no vea salir la petición tiene un problema de
// andamiaje, no un hallazgo. Por eso `pulsarReservar` DEVUELVE cuántas veces se
// llamó al endpoint: quien lo use debe exigir que sea > 0 antes de interpretar
// nada. Ver [[test-4xx-necesita-contador-de-intentos]].
// ─────────────────────────────────────────────────────────────────────────────

export const SLUG = 'tentare';
export const STUDIO_ID = 'studio-test';
export const SOCIO_ID = 'socio-e2e-1';
/** El reloj del navegador durante estos tests. La clase es de ese mismo día. */
export const AHORA = '2026-08-12T08:00:00';
export const SESION_ID = 'ses-10';

export function fixtureSociaLista() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Sin planes a propósito: con un plan exigido, `evaluarGate` derivaría al
    // modal y la petición no saldría (condición 3 de la cabecera).
    planesTarifa: [],
    sesiones: [{
      id: SESION_ID, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
      inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false,
    }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [],
    socia: {
      socio: {
        id: SOCIO_ID, studioId: STUDIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com',
        // Condición 2. Sin esto, `needsContract` y adiós escritura.
        aceptacionContrato: { aceptadoEn: '2026-01-01T00:00:00Z', versionTexto: 'x', ip: null },
      },
      reservas: [], suscripciones: [], plazasFijas: [], recibos: [],
    },
  };
}

/** Deja la página lista: reloj fijo, sesión de portal y los mocks de lectura. */
export async function sembrarSociaLista(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e', email: 'socia-e2e@test.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
  // Red de seguridad: cualquier llamada a Supabase REST que el test no mockee a
  // propósito no debe tumbar la página.
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }) }));
  // Aforo ligero (el horario y la hoja de clase lo piden aparte del payload):
  // coherente con el fixture, que no tiene reservas de aforo.
  await page.route('**/api/public/aforo**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sesionIds: [SESION_ID], aforoReservas: [] }) }));
}

/** Abre la hoja de la clase de las 10:00. */
export async function abrirHojaDeClase(page: Page) {
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  // El botón de confirmar de la hoja se llama exactamente «Reservar» — el de la
  // tarjeta de detrás lleva la etiqueta larga, así que `^Reservar$` distingue.
  await expect(page.getByRole('button', { name: /^Reservar$/ })).toBeVisible({ timeout: 30_000 });
}

/** Pulsa confirmar en la hoja. Quien lo llame debe exigir intentos > 0. */
export async function pulsarReservar(page: Page) {
  await page.getByRole('button', { name: /^Reservar$/ }).last().click();
}
