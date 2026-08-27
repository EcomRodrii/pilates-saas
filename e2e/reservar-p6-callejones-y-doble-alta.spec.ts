import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// 17ª auditoría (26-ago), P-6: tres síntomas de la máquina de estados del
// widget público (app/reservar/[slug]/page.tsx), cada uno con su propio test
// de regresión — sin él, no hay forma de saber si un sexto retoque reabre
// alguno de los tres:
//
// A) `?sesion=` (ficha-resumen, deep-link "Reserva esta clase") no estaba en
//    el cómputo de `enVistaReserva` — la visitante veía la ficha Y toda la
//    página genérica (tabs, filtros, bonos, pie) alrededor.
// B) Tres botones "Acceder" (Mis reservas/Cuenta/Citas) abrían el paso
//    'login' a mano en vez de llamar a `openBooking('')` — una walk-in YA
//    AUTENTICADA por magic link pero sin ficha se quedaba mirando un
//    formulario de login inútil, sin salida salvo cerrar el widget.
// C) `handleSignContract` no tenía cerrojo contra doble clic: dos pulsaciones
//    rápidas en "Aceptar y continuar" (alta walk-in en acceso genérico)
//    disparaban dos veces `crearAltaWalkIn`, y `socios` no tenía ningún
//    UNIQUE que lo impidiera a nivel de servidor — dos fichas reales para la
//    misma persona.
// ─────────────────────────────────────────────────────────────────────────────

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

async function mocksBase(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', r => json(r, { id: STUDIO_ID }));
  await page.route('**/api/theme**', r => json(r, { primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }));
  await page.route('**/api/public/studio-data', r => json(r, fixture()));
}

// Sesión de Supabase falsa en localStorage — mismo patrón que
// e2e/acceso-sin-callejones.spec.ts, pero con el storageKey del cliente del
// PORTAL (`lib/db/supabase-portal.ts`), deliberadamente distinto del cliente
// de staff (`sb-<project-ref>-auth-token`) para que la sesión de una socia no
// pise la de quien usa el panel en el mismo navegador.
async function seedSesionAutenticada(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-walkin', email: 'walkin@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
}

test.describe('A — ?sesion= no tapa la ficha con la página genérica alrededor', () => {
  test('entrar por el deep-link enseña SOLO la ficha, no los tabs de al lado', async ({ page }) => {
    await mocksBase(page);
    // Sin sesión: el deep-link `?sesion=` funciona también para visitantes
    // anónimas (comentario junto a `sesionDeepLink` en page.tsx).
    await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));

    await page.goto(`/reservar/${SLUG}?tab=clases&sesion=ses-r`);

    await expect(page.getByRole('button', { name: 'Reservar mi plaza' })).toBeVisible({ timeout: 30_000 });

    // Antes del fix, la barra de tabs (Clases/Mis reservas/El estudio/Mi
    // cuenta) se pintaba a la vez que la ficha — `enVistaReserva` no incluía
    // `fichaSesionId`. Con el fix, `!enVistaReserva` la oculta igual que ya
    // hacía para la ficha del calendario normal.
    await expect(page.getByRole('button', { name: 'Mis reservas' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'El estudio' })).not.toBeVisible();
  });
});

test.describe('B — "Acceder" ya autenticada no deja a la walk-in en un callejón', () => {
  test('desde Mis reservas, una walk-in autenticada sin ficha va a "¿Cómo te llamas?", no a un login inútil', async ({ page }) => {
    await mocksBase(page);
    await seedSesionAutenticada(page);
    // 404: autenticada por Supabase pero SIN ficha en `socios` de este
    // estudio — el caso walk-in que describe use-socia-session.ts.
    await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));

    await page.goto(`/reservar/${SLUG}?tab=misreservas`);

    // Dos botones "Acceder" en la página: el de la cabecera (ya usaba
    // openBooking('') sin el bug) y el de esta tarjeta — el segundo en el DOM.
    await page.getByRole('button', { name: 'Acceder' }).nth(1).click();

    // El bug: los tres botones "Acceder" hacían setBookingSesionId('') +
    // setLoginStep('login') a mano, sin pasar por openBooking('') — así que
    // una walk-in YA AUTENTICADA se quedaba viendo el formulario de login
    // (inútil, ya lo está) sin ningún control que la reenviara a 'registro'.
    await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Entra para reservar' })).not.toBeVisible();
  });
});

test.describe('C — doble clic en "Aceptar y continuar" no da de alta dos fichas', () => {
  test('el segundo clic no dispara una segunda petición de alta', async ({ page }) => {
    await mocksBase(page);
    await seedSesionAutenticada(page);
    await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));

    let altas = 0;
    await page.route('**/api/public/socio', async route => {
      const body = route.request().postDataJSON() as { accion?: string };
      if (body?.accion === 'registrar') {
        altas += 1;
        // Deliberadamente lento: si el cerrojo fallara, da tiempo de sobra a
        // que un segundo clic dispare una segunda petición antes de que la
        // primera responda.
        await new Promise(res => setTimeout(res, 400));
        return json(route, { ok: true });
      }
      return json(route, { ok: true });
    });

    // Acceso genérico (botón "Acceder" de la cabecera) → walk-in autenticada
    // sin ficha → openBooking('') decide 'registro'.
    await page.goto(`/reservar/${SLUG}?tab=clases&acceso=1`);
    await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Tu nombre completo').fill('Ana');
    await page.getByPlaceholder(/Tu teléfono/).fill('+34 600 000 000');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByRole('heading', { name: 'Acepta los términos' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('checkbox').check();

    const boton = page.getByRole('button', { name: /Aceptar y continuar/ });
    // Dos clics tan rápidos como Playwright permite — el escenario real es
    // un doble clic humano, no dos peticiones separadas a propósito.
    await Promise.all([boton.click(), boton.click()]);

    // Deja que la petición (lenta a propósito) termine antes de comprobar.
    await page.waitForTimeout(600);
    expect(altas, 'el segundo clic no debería haber disparado una segunda alta').toBe(1);
  });
});
