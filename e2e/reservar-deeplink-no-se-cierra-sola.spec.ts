import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La hoja que abre un deep link (`?acceso=1`, `?sesion=…&directo=1`) no puede
// cerrarse sola (app/reservar/[slug]/page.tsx, Efecto A / Efecto B del botón
// Atrás real).
//
// Efecto B refleja la hoja recién abierta con `pushState(…&paso=…)`, pero Next
// sincroniza `useSearchParams()` un render más tarde. Si en ese hueco cambia
// algo de lo que depende Efecto A (`slots`: el reloj de un minuto, o datos que
// acaban de llegar), Efecto A leía la URL VIEJA, la tomaba por un Atrás y
// cerraba la hoja. Con las clases ya cargadas, el reintento de Efecto A y ese
// cierre caían en el mismo render: Efecto B lo leía como un cierre
// programático, hacía `history.go(-1)`, y la hoja se quedaba cerrada con la
// URL sin `paso` — un e2e de CI esperó «¿Cómo te llamas?» 30 s con el
// calendario ya pintado.
//
// El hueco dura milisegundos y `page.route` no llega a él: aquí se dispara A
// MANO el reloj de un minuto de la página (`setInterval(…, 60_000)`, de donde
// sale `nowMs` → `slots`) justo después de ese `pushState`, que es el peor
// momento posible. Y se cuenta CUALQUIER cierre, no solo el estado final: el
// cierre que luego se reabre es el mismo fallo, solo con mejor suerte.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(90_000);

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
    },
    tiposClase: [
      { id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [],
    sesiones: [
      { id: 'ses-r', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

// Sesión de Supabase del cliente del PORTAL (storageKey `sb-portal-auth`),
// mismo patrón que reservar-p6-callejones-y-doble-alta.spec.ts.
const SESION_WALKIN = {
  access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
  expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
  user: {
    id: 'u-walkin', email: 'walkin@example.com', aud: 'authenticated', role: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
  },
};

type Hoja = { relojDisparado: boolean; abierta: boolean; aperturas: number; cierres: number };

async function montar(page: Page, titulo: string, sesion: 'walkin' | 'invitada') {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', r => json(r, { id: STUDIO_ID }));
  await page.route('**/api/theme**', r => json(r, { primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }));
  await page.route('**/api/public/studio-data', r => json(r, fixture()));
  // walk-in: autenticada pero sin ficha (404). Invitada: sin sesión (401).
  await page.route('**/api/public/session', r => r.fulfill({ status: sesion === 'walkin' ? 404 : 401, contentType: 'application/json', body: '{}' }));
  if (sesion === 'walkin') {
    await page.addInitScript((s) => localStorage.setItem('sb-portal-auth', JSON.stringify(s)), SESION_WALKIN);
  }

  await page.addInitScript((titulo: string) => {
    const hoja: Hoja = { relojDisparado: false, abierta: false, aperturas: 0, cierres: 0 };
    (window as unknown as { __hoja: Hoja }).__hoja = hoja;

    const relojes: Array<() => void> = [];
    const setIntervalOriginal = window.setInterval;
    window.setInterval = ((fn: () => void, ms?: number, ...resto: unknown[]) => {
      if (ms === 60_000) relojes.push(fn);
      return setIntervalOriginal(fn, ms, ...resto);
    }) as typeof setInterval;

    // Next parchea `history.pushState` al montar y llama a ESTE (el del
    // prototipo) después de encolar su propia sincronización de la URL: justo
    // el hueco en el que `useSearchParams()` todavía devuelve la URL vieja.
    const pushOriginal = History.prototype.pushState;
    History.prototype.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
      const r = pushOriginal.call(this, data, unused, url);
      if (!hoja.relojDisparado && relojes.length > 0 && /[?&]paso=/.test(String(url))) {
        hoja.relojDisparado = true;
        relojes.forEach(fn => fn());
      }
      return r;
    };

    new MutationObserver(() => {
      const abierta = [...document.querySelectorAll('h1, h2, h3')].some(h => h.textContent?.trim() === titulo);
      if (abierta === hoja.abierta) return;
      hoja.abierta = abierta;
      if (abierta) hoja.aperturas += 1; else hoja.cierres += 1;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, titulo);
}

const estadoHoja = (page: Page) => page.evaluate(() => (window as unknown as { __hoja: Hoja }).__hoja);

test('volver del enlace mágico (?acceso=1): la hoja no se cierra sola', async ({ page }) => {
  // Mismo escenario que el test C de reservar-p6-callejones-y-doble-alta.spec.ts
  // —el que se quedó colgado en CI—: walk-in ya autenticada, sin ficha.
  await montar(page, '¿Cómo te llamas?', 'walkin');
  await page.goto(`/reservar/${SLUG}?tab=clases&acceso=1`);

  await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible({ timeout: 60_000 });
  // Sin esto el test podría pasar sin haber probado nada: el reloj tiene que
  // haberse disparado de verdad en el hueco.
  await expect.poll(async () => (await estadoHoja(page)).relojDisparado).toBe(true);
  await page.waitForTimeout(1_000);

  await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('paso')).toBe('registro');
  expect((await estadoHoja(page)).cierres, 'la hoja se cerró sola (aunque luego se reabriera)').toBe(0);
});

test('`?sesion=…&directo=1` (redirect del widget): el flujo de acceso no se cierra solo', async ({ page }) => {
  await montar(page, 'Entra para reservar', 'invitada');
  await page.goto(`/reservar/${SLUG}?tab=clases&sesion=ses-r&directo=1`);

  await expect(page.getByRole('heading', { name: 'Entra para reservar' })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await estadoHoja(page)).relojDisparado).toBe(true);
  await page.waitForTimeout(1_000);

  await expect(page.getByRole('heading', { name: 'Entra para reservar' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('paso')).toBe('login');
  expect((await estadoHoja(page)).cierres, 'la hoja se cerró sola (aunque luego se reabriera)').toBe(0);
});
