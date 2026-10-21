import { test, expect, type Page, type Route } from '@playwright/test';
import { resumirActivacion, type FilaEmbudo } from '../lib/alta/embudo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Tres señales que ya se estaban escribiendo y no las leía nadie.
//
//   · Los leads del formulario de migración de la landing, que ni siquiera se
//     guardaban: iban a un correo, y si `RESEND_API_KEY` no estaba puesta la
//     ruta devolvía `{ok:true}` y el lead desaparecía mientras la visitante
//     leía "Recibido, te escribimos en menos de 24h".
//   · `studios.como_nos_conocio`, que se rellena en el alta desde la migración
//     0123 y no salía en ninguna pantalla.
//   · `soporte_solicitudes`: 4 peticiones reales en producción, la más vieja de
//     abril, sin ninguna UI que las mostrase.
//
// La lógica está en `lib/interno/crecimiento.test.ts` (15 casos). Aquí se
// prueba lo que decide si la pantalla sirve: que lo primero que se ve es a
// quién escribir HOY, y que los números no se presentan como más sólidos de lo
// que son.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const HOY = Date.now();
const haceDias = (n: number) => new Date(HOY - n * 86_400_000).toISOString();
const dia = (n: number) => new Date(HOY - n * 86_400_000).toISOString().slice(0, 10);

const lead = (o: Record<string, unknown>) => ({
  nombre: null, estudio: null, telefono: null, ciudad: null, softwareActual: null,
  mensaje: null, origen: 'CONCIERGE', estado: 'NUEVO', motivoPerdida: null,
  proximoPaso: null, proximaFecha: null, studioId: null, notas: null,
  creadoEn: haceDias(0), actualizadoEn: haceDias(0), ...o,
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

async function mockPanel(page: Page, datos: Record<string, unknown>) {
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['admin.full'] }));
  await page.route('**/api/interno/crecimiento**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true, id: 'lead-x' });
    return json(route, { leads: [], estudios: [], peticiones: [], ...datos });
  });
}

test.describe('Crecimiento no deja que una señal se pierda ni infla las que hay', () => {
  test('lo primero es a quién escribir hoy, con el motivo', async ({ page }) => {
    await mockPanel(page, {
      leads: [
        lead({ id: 'l1', email: 'ana@ejemplo.com', nombre: 'Ana', creadoEn: haceDias(4), actualizadoEn: haceDias(4) }),
        lead({ id: 'l2', email: 'bea@ejemplo.com', nombre: 'Bea', estado: 'DEMO', proximaFecha: dia(3) }),
        lead({ id: 'l3', email: 'cris@ejemplo.com', nombre: 'Cris', estado: 'CLIENTE', creadoEn: haceDias(300), actualizadoEn: haceDias(300) }),
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const hoy = page.getByTestId('para-hoy');
    await expect(hoy).toBeVisible({ timeout: 30_000 });
    await expect(hoy).toContainText('2 lead(s) para hoy');
    await expect(hoy).toContainText('venció hace 3 día');
    await expect(hoy).toContainText('nadie le ha escrito');
    // Un cliente de hace 300 días no quema por viejo que sea.
    await expect(hoy).not.toContainText('Cris');
  });

  test('sin nada cerrado la conversión es «—», no 0 %', async ({ page }) => {
    // 0 % se lee como "no convertimos a nadie"; la verdad es "todavía no se sabe".
    await mockPanel(page, { leads: [lead({ id: 'l1', email: 'a@b.com', estado: 'DEMO' })] });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText('Conversión')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Todavía no se ha cerrado ninguno')).toBeVisible();
    await expect(page.getByText('0 %')).toHaveCount(0);
  });

  test('las peticiones se agrupan por lo que piden, no por quién lo pide', async ({ page }) => {
    await mockPanel(page, {
      peticiones: [
        { id: 'p1', tipo: 'MEJORA', mensaje: 'Quiero ClassPass', contacto: null, estudio: 'Boutique', creadoEn: haceDias(9) },
        { id: 'p2', tipo: 'MEJORA', mensaje: 'quiero classpass', contacto: null, estudio: 'Gràcia', creadoEn: haceDias(2) },
        { id: 'p3', tipo: 'MEJORA', mensaje: 'Quiero WhatsApp', contacto: null, estudio: 'Boutique', creadoEn: haceDias(1) },
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const bloque = page.getByTestId('peticiones');
    await expect(bloque).toBeVisible({ timeout: 30_000 });
    await expect(bloque).toContainText('2 estudios lo piden');
    await expect(bloque).toContainText('Boutique, Gràcia');
  });

  test('con 1 respuesta de 11, el «de dónde vienen» avisa de que es una anécdota', async ({ page }) => {
    // El caso real de producción: como_nos_conocio lo ha contestado 1 estudio.
    // Sin el aviso, "Instagram: 1" se lee como "el canal principal es Instagram".
    await mockPanel(page, {
      estudios: [
        { id: 's1', nombre: 'A', comoNosConocio: 'Instagram', creadoEn: haceDias(30) },
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `s${i + 2}`, nombre: `E${i}`, comoNosConocio: null, creadoEn: haceDias(30),
        })),
      ],
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText(/Solo 1 de 11 estudios lo han contestado/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no es un reparto de canales, es una anécdota/)).toBeVisible();
  });

  test('marcar un lead como perdido exige decir por qué', async ({ page }) => {
    // Un embudo que dice cuántos se caen pero no por qué no cambia nada.
    await mockPanel(page, { leads: [lead({ id: 'l1', email: 'ana@ejemplo.com', nombre: 'Ana' })] });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await page.getByRole('button', { name: 'Ana' }).first().click({ timeout: 30_000 });
    const ficha = page.getByTestId('ficha-lead');
    await expect(ficha).toBeVisible();
    await expect(ficha.getByPlaceholder(/Por qué se ha perdido/)).toHaveCount(0);

    await ficha.getByLabel('Estado').selectOption('PERDIDO');
    await expect(ficha.getByPlaceholder(/Por qué se ha perdido/)).toBeVisible();
  });

  test('sin ningún lead se explica que los del formulario entran solos', async ({ page }) => {
    // Un vacío que no dice nada se lee como "esto está roto".
    await mockPanel(page, {});
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByText(/Los del formulario de migración de la landing\s+entran aquí solos/))
      .toBeVisible({ timeout: 30_000 });
  });
});

// El concierge de migración se retiró el 21-oct-2026: el formulario «Te la
// hacemos nosotros» prometía que Tentare hacía la migración, y nadie la hace.
// La ruta se queda contestando 410 para una pestaña vieja, sin guardar ningún
// lead ni avisar a nadie. Los que ya entraron siguen en Crecimiento.
test.describe('El concierge de migración está retirado', () => {
  test('contesta 410 y dice cuál es la vía que existe', async ({ request }) => {
    const res = await request.post('/api/public/migracion-concierge', {
      data: { email: 'propietaria@example.com', software: 'Momence' },
    });
    expect(res.status()).toBe(410);
    expect((await res.json()).error).toContain('importador');
  });
});

// Altas de estudio sin terminar: el paso exacto en que se quedó cada una y si
// le llegó el correo de las 24 h. La lógica está en lib/alta/abandono.test.ts.
test.describe('Crecimiento enseña dónde se quedó cada alta de estudio', () => {
  const fila = (o: Record<string, unknown>) => ({
    authUserId: 'u1', email: 'ana@example.com', estudio: 'Estudio Aurora', origen: 'registro',
    iniciadaEn: haceDias(3), paso: 'email_sin_confirmar', pasoDesde: haceDias(3),
    correoEnviadoEn: null, correoPaso: null, correoNoSeEnvia: null, terminoTrasCorreo: false, ...o,
  });

  test('cada alta con su paso y su correo, y el recuento arriba', async ({ page }) => {
    let pedidas = 0;
    await mockPanel(page, {});
    // Después de mockPanel: su `crecimiento**` también casa con esta ruta.
    await page.route('**/api/interno/crecimiento/altas', route => {
      pedidas += 1;
      return json(route, {
        filas: [
          fila({ correoEnviadoEn: haceDias(2), correoPaso: 'email_sin_confirmar' }),
          fila({
            authUserId: 'u2', email: 'bea@example.com', estudio: 'Pilates Mar', paso: 'terminada',
            pasoDesde: haceDias(1), correoEnviadoEn: haceDias(2), terminoTrasCorreo: true,
          }),
        ],
        resumen: {
          total: 2, correos: 2, terminaronTrasCorreo: 1,
          porPaso: { formulario_estudio: 0, formulario_plan: 0, email_sin_confirmar: 1, estudio_sin_crear: 0, error_estudio: 0, terminada: 1 },
        },
      });
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const seccion = page.getByTestId('altas-sin-terminar');
    await expect(seccion).toBeVisible({ timeout: 30_000 });
    expect(pedidas).toBeGreaterThan(0);
    await expect(seccion).toContainText('Código del email sin escribir: 1');
    await expect(seccion).toContainText('Correos enviados: 2 · terminaron después: 1');
    await expect(seccion).toContainText('Pilates Mar');
    await expect(seccion).toContainText('terminó después');
  });

  test('sin permiso (403) la sección no sale y el resto de la pantalla sigue', async ({ page }) => {
    let pedidas = 0;
    await mockPanel(page, {});
    await page.route('**/api/interno/crecimiento/altas', route => {
      pedidas += 1;
      return json(route, { error: 'Te falta el permiso "growth.read" para hacer esto.' }, 403);
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByRole('heading', { name: 'Altas y prospectos' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => pedidas).toBeGreaterThan(0);
    await expect(page.getByTestId('altas-sin-terminar')).toHaveCount(0);
  });
});

// Activación de estudios nuevos (PR-1 del alta nueva, «medir primero»): el
// embudo del alta y sus cohortes por semana. La lógica está en
// lib/alta/embudo.test.ts; aquí, lo que decide si la pantalla dice la verdad:
// que un fallo de lectura se ve como «Faltan datos» y nunca como ceros, y que
// lo que todavía no se mide sale «—».
test.describe('Activación de estudios nuevos no inventa cifras', () => {
  // La respuesta se construye con la MISMA función que usa la ruta: si la
  // forma cambia, este test cambia con ella.
  const masHoras = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();
  const estudio = (i: number, diaAlta: string, o: Partial<FilaEmbudo> = {}): FilaEmbudo => ({
    studioId: `st-${i}`, semana: diaAlta, diaAlta, version: 'v1', llegada: null,
    altaIniciadaEn: null, emailConfirmadoEn: null, estudioCreadoEn: `${diaAlta}T10:00:00Z`,
    tieneTipoClase: true, tieneClase: false, primeraClaseEn: null, tieneTarifaActiva: false, primeraReservaEn: null,
    pasos: {}, diasPanel: [], medidoDesde: {}, ...o,
  });
  // Once estudios de antes del alta nueva, cuatro con clase (mediana 23,9 h) y dos con reserva.
  const horas = [5, 18.5, 29.3, 40];
  const filas = Array.from({ length: 11 }, (_, i) => {
    const base = estudio(i, i < 4 ? '2026-09-10' : '2026-10-08');
    if (i >= 4) return base;
    const creado = base.estudioCreadoEn ?? '';
    return {
      ...base, tieneClase: true, primeraClaseEn: masHoras(creado, horas[i]),
      primeraReservaEn: i < 2 ? masHoras(creado, 50 + i * 200) : null,
    };
  });
  const RESUMEN = resumirActivacion(filas, '2026-10-21');

  test('si la lectura falla (500), «Faltan datos» y ni una cifra; el resto de la pantalla sigue', async ({ page }) => {
    let intentos = 0;
    await mockPanel(page, {});
    // Después de mockPanel: su `crecimiento**` también casa con esta ruta.
    await page.route('**/api/interno/crecimiento/activacion', route => {
      intentos += 1;
      return json(route, { error: 'No se ha podido leer el embudo del alta' }, 500);
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const seccion = page.getByTestId('activacion-estudios-nuevos');
    await expect(seccion.getByRole('alert')).toContainText('Faltan datos', { timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(seccion.getByTestId('cohortes-alta')).toHaveCount(0);
    await expect(seccion.getByTestId('embudo-alta')).toHaveCount(0);
    await expect(seccion.getByText(/\b\d+\s*\/\s*\d+\b/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Altas y prospectos' })).toBeVisible();
  });

  test('una respuesta sin la forma esperada también es «Faltan datos», no ceros', async ({ page }) => {
    let intentos = 0;
    await mockPanel(page, {});
    await page.route('**/api/interno/crecimiento/activacion', route => { intentos += 1; return json(route, {}); });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const seccion = page.getByTestId('activacion-estudios-nuevos');
    await expect(seccion.getByRole('alert')).toContainText('Faltan datos', { timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
  });

  test('con datos: las cifras de la auditoría, y «—» en lo que aún no se mide', async ({ page }) => {
    let intentos = 0;
    await mockPanel(page, {});
    await page.route('**/api/interno/crecimiento/activacion', route => { intentos += 1; return json(route, RESUMEN); });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    const seccion = page.getByTestId('activacion-estudios-nuevos');
    await expect(seccion).toContainText('4/11', { timeout: 30_000 });
    expect(intentos).toBeGreaterThan(0);
    await expect(seccion).toContainText('23,9 h');
    await expect(seccion).toContainText('Mediana, n = 4');
    await expect(seccion).toContainText('2/11');
    await expect(seccion).toContainText('No se mide todavía.');
    await expect(seccion.getByRole('alert')).toHaveCount(0);

    // Los pasos que se apuntan desde este cambio, sin datos: «—» y no 0.
    const embudo = seccion.getByTestId('embudo-alta');
    for (const paso of ['config_completada', 'clase_reservable', 'enlace_compartido']) {
      const fila = embudo.getByTestId(`paso-${paso}`);
      await expect(fila).toContainText('—');
      await expect(fila).toContainText('sin datos todavía');
    }

    const tabla = seccion.getByTestId('cohortes-alta');
    const antes = tabla.getByRole('row', { name: /Antes del alta nueva/ });
    await expect(antes.getByRole('cell')).toHaveText(['Antes del alta nueva · sep-oct', '11', '4', '2', '23,9 h', '— · — · —', '2']);
    const semana1 = tabla.getByRole('row', { name: /Semana 1 con el alta nueva/ });
    await expect(semana1.getByRole('cell')).toHaveText(['Semana 1 con el alta nueva', '—', '—', '—', '—', '— · — · —', '—']);
  });

  test('sin permiso (403) la sección no sale y el resto de la pantalla sigue', async ({ page }) => {
    let intentos = 0;
    await mockPanel(page, {});
    await page.route('**/api/interno/crecimiento/activacion', route => {
      intentos += 1;
      return json(route, { error: 'Te falta el permiso "growth.read" para hacer esto.' }, 403);
    });
    await seedSesion(page);
    await page.goto('/interno/crecimiento');

    await expect(page.getByRole('heading', { name: 'Altas y prospectos' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => intentos).toBeGreaterThan(0);
    await expect(page.getByTestId('activacion-estudios-nuevos')).toHaveCount(0);
  });
});
