import { expect, type Page, type Route } from '@playwright/test';

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

/**
 * El plan de CUOTA de los andamiajes: uno solo, para que la ficha, el horario y Bonos hablen de la misma cuota
 * (`socia-completa` lo usa también). `limiteSemanal` se pone por test cuando hace falta.
 */
export const PLAN_MENSUAL = {
  id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 89, activo: true, periodicidadMeses: 1,
};

export function fixtureSociaLista() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
      // Lo que manda producción (`studioPublico`: `reserva_exigir_plan ?? true`). Sin el campo la app no sabe si la clase
      // exige plan y la hoja cae en su respaldo («Confirmar … igualmente»), una pantalla que ninguna alumna ve. Una spec
      // que necesite ese respaldo lo pone a `null` ella misma. Con `planesTarifa: []` no bloquea (no hay nada que
      // contratar, `exigePlanAlReservar`), igual que en el servidor.
      reservaExigirPlan: true,
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
// `relojMadrid`: `AHORA` es una hora SIN zona y `new Date(AHORA)` la interpreta el
// runner (Node), no el navegador: en CI (UTC) eran las 08:00 UTC = las 10:00 de
// Madrid. Los specs que miran horas en la zona del estudio (canal público, RES-7-f)
// lo piden y el reloj queda a las 08:00 DE MADRID en cualquier máquina.
export async function sembrarSociaLista(page: Page, opciones: { relojMadrid?: boolean } = {}) {
  await page.clock.install({ time: new Date(opciones.relojMadrid ? `${AHORA}+02:00` : AHORA) });
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
  // Bonos: los movimientos y la semana de la cuota (P4). Vacío por defecto; un spec que los mire registra el suyo DESPUÉS.
  await page.route('**/api/public/mis-bonos', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ movimientos: { movimientos: [], hayMas: false, cuadra: true, historialCompleto: true, desde: null }, semanas: [] }) }));
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

// ── Ayudantes del horario (P11–P13) ─────────────────────────────────────────
// Suman al fixture sin cambiar lo que hay. Las rutas propias de cada spec van SIEMPRE después de `sembrarSociaLista`:
// en Playwright gana la última registrada.

type Fixture = Record<string, unknown>;

/**
 * Un bono (o la CUOTA, el `PLAN_MENSUAL` de arriba) para la socia del fixture. `tipos`: los tipos de clase a los que
 * está acotado; `restantes`: lo que le queda al bono.
 */
export function conBono(f: Fixture, o: { cuota?: boolean; tipos?: string[]; restantes?: number } = {}): Fixture {
  const plan = o.cuota
    ? { ...PLAN_MENSUAL, ...(o.tipos ? { tiposClaseIds: o.tipos } : {}) }
    : { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true, ...(o.tipos ? { tiposClaseIds: o.tipos } : {}) };
  f.planesTarifa = [...((f.planesTarifa as unknown[]) ?? []), plan];
  (f.socia as Fixture).suscripciones = [{
    id: o.cuota ? 'sus-mes' : 'sus-1', socioId: SOCIO_ID, planId: plan.id, estado: 'ACTIVA',
    sesionesRestantes: o.cuota ? null : (o.restantes ?? 5), fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
  }];
  return f;
}

/**
 * Las sesiones del horario con su instante y su ZONA (`+02:00`, hora de Madrid): sin zona, el navegador las lee en la
 * de la máquina y con TZ=UTC (el CI) una clase de las 10:00 sale a las 12:00. La primera es la del fixture (`ses-10`).
 */
export function conSesiones(f: Fixture, sesiones: Array<{ id: string; fecha?: string; hora: string; min?: number } & Record<string, unknown>>): Fixture {
  f.sesiones = sesiones.map(({ id, fecha = '2026-08-12', hora, min = 50, ...resto }) => {
    const [h, m] = hora.split(':').map(Number);
    const fin = h * 60 + m + min;
    const hhmm = `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
    return {
      id, studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', aforoMaximo: 10, cancelada: false,
      inicio: `${fecha}T${hora}:00+02:00`, fin: `${fecha}T${hhmm}:00+02:00`, ...resto,
    };
  });
  return f;
}

/**
 * Cuenta los POST a una ruta y contesta con `responder`. Devuelve el contador (los cuerpos): quien lo use exige que se
 * haya intentado algo antes de interpretar nada (un test de fallo sin contador puede pasar por no haber pedido nada).
 */
export async function contarPost(page: Page, ruta: string, responder: (r: Route) => Promise<unknown> | unknown): Promise<unknown[]> {
  const cuerpos: unknown[] = [];
  await page.route(ruta, (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    cuerpos.push(r.request().postDataJSON());
    return responder(r) as Promise<void>;
  });
  return cuerpos;
}
