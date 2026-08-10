import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El panel interno era inusable en el móvil, y la causa era UNA sola.
//
// La cabecera ponía las seis secciones más el nombre en una fila. En 375px eso
// necesita ~800px, así que el DOCUMENTO ENTERO se ensanchaba a esa medida:
// scroll horizontal en todas las pantallas, la barra oscura pintando solo el
// ancho de la ventana, y media navegación fuera de alcance.
//
// Este test mide justo eso — `scrollWidth` del documento contra `innerWidth` —
// porque es un fallo que se cuela sin que nadie lo note al añadir una sección
// nueva, y no se ve en escritorio. Lo demás (tablas convertidas en fichas,
// tarjetas de dos en dos) se comprueba de refilón: si algo desborda, sale aquí.
// ─────────────────────────────────────────────────────────────────────────────

const MOVIL = { width: 375, height: 812 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const ahora = Date.parse('2026-07-29T12:00:00Z');
const hace = (n: number) => new Date(ahora - n * 86_400_000).toISOString();

const linea = (o: Record<string, unknown>) => ({
  tipo: 'estudio', sedes: 1, planEnBd: 'ESTUDIO', estadoEnBd: 'active', eurosMes: 0,
  renuevaEl: null, diasDePrueba: null, stripeCustomerId: null, motivoDescuadre: null, ...o,
});
const lead = (o: Record<string, unknown>) => ({
  nombre: null, estudio: null, telefono: null, ciudad: null, softwareActual: null, mensaje: null,
  origen: 'CONCIERGE', estado: 'NUEVO', motivoPerdida: null, proximoPaso: null, proximaFecha: null,
  studioId: null, notas: null, creadoEn: hace(0), actualizadoEn: hace(0), ...o,
});

async function mockPanel(page: Page) {
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/api/interno/sesion**', r => json(r, {
    nombre: 'Marco Roca', cargo: 'Fundador y CEO', email: 'marco@tentare.app', permisos: ['admin.full'],
  }));
  await page.route('**/api/interno/kpis**', r => json(r, {
    estudios: { total: 11, conActividad: 4, vacios: 7, altasUltimos30d: 3, suspendidos: 0 },
    actividad: { socias: 186, clases: 412, reservasHoy: 12, reservas7d: 64, reservas30d: 210 },
    altasPorMes: [{ mes: '2026-06', altas: 4 }, { mes: '2026-07', altas: 5 }],
    onboarding: { activados: 2, totalConActividad: 4, pasoMasBloqueante: { id: 'pago', label: 'Activa los métodos de pago', pendientes: 2 } },
  }));
  await page.route('**/api/interno/facturacion**', r => json(r, {
    mrrEuros: 277, mrrEnPruebaEuros: 79, pagando: 3, enPrueba: 1, impagos: 1, manuales: 4,
    descuadres: 0, suscripcionesEnStripe: 6, stripeDisponible: true, avisoStripe: null,
    pruebasQueAcaban: [],
    lineas: [
      linea({ tipo: 'cadena', id: 'c1', nombre: 'Pilates Boutique', sedes: 4, estado: 'pagando', eurosMes: 149, planEnBd: 'CADENA', renuevaEl: hace(-16) }),
      linea({ id: 'e3', nombre: 'Pilates Eixample', estado: 'impago', motivoDescuadre: 'Stripe dice «past_due» y aquí sigue con acceso' }),
      linea({ id: 'e6', nombre: 'Centre Pilates Vic', estado: 'manual', estadoEnBd: null }),
    ],
  }));
  await page.route('**/api/interno/crecimiento**', r => json(r, {
    leads: [
      lead({ id: 'l1', email: 'laura@pilatesgracia.es', nombre: 'Laura Bosch', estudio: 'Pilates Gràcia', softwareActual: 'Momence', creadoEn: hace(4), actualizadoEn: hace(4) }),
      lead({ id: 'l5', email: 'ines@zen.es', nombre: 'Inés Prat', estudio: 'Zen Studio', estado: 'PERDIDO', motivoPerdida: 'Se quedó en Bsport', creadoEn: hace(50), actualizadoEn: hace(35) }),
    ],
    estudios: [{ id: 's1', nombre: 'A', comoNosConocio: 'Instagram', creadoEn: hace(30) }],
    peticiones: [{ id: 'p1', tipo: 'MEJORA', mensaje: 'Solicito acceso al agregador ClassPass (requiere alta como partner).', contacto: null, estudio: 'Pilates Boutique', creadoEn: hace(15) }],
  }));
  await page.route('**/api/interno/equipo**', r => json(r, {
    yo: 'u-marco',
    equipo: [{
      userId: 'u-meri', email: 'meri@tentare.app', nombre: 'Meri',
      cargo: 'Cofundadora y Jefa de Equipo de Marketing', activo: true,
      creadoEn: hace(200), ultimoAcceso: hace(1),
      permisos: ['billing.read', 'crm.update', 'logs.read', 'marketing.send', 'studios.read'],
    }],
  }));
  await page.route('**/api/interno/estudios**', r => json(r, {
    estudios: [{
      id: 's1', slug: 'pilates-gracia', nombre: 'Pilates Gràcia', plan: 'ESTUDIO',
      email: 'laura@x.es', telefono: '600111222', creadoEn: hace(120), tieneClienteStripe: true,
      socias: 64, clases: 180, equipo: 5, ultimaClase: hace(1), vacio: false,
    }],
  }));
  await page.route('**/api/interno/auditoria**', r => json(r, { entradas: [] }));
  await page.addInitScript(() => localStorage.setItem('sb-example-auth-token', JSON.stringify({
    access_token: 'e2e-fake-token', refresh_token: 'r', expires_at: 4102444800,
    expires_in: 999999999, token_type: 'bearer',
    user: {
      id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    },
  })));
}

const PANTALLAS: Array<[string, string, string]> = [
  ['Resumen', '/interno', 'Uso de la plataforma'],
  ['Estudios', '/interno/estudios', 'Pilates Gràcia'],
  ['Facturación', '/interno/facturacion', 'Cuenta por cuenta'],
  ['Crecimiento', '/interno/crecimiento', 'Embudo'],
  ['Equipo', '/interno/equipo', 'Meri'],
];

test.describe('El panel interno cabe en un móvil', () => {
  for (const [nombre, ruta, ancla] of PANTALLAS) {
    test(`${nombre} no desborda a lo ancho`, async ({ page }) => {
      await mockPanel(page);
      await page.setViewportSize(MOVIL);
      await page.goto(ruta);
      await page.getByText(ancla).first().waitFor({ timeout: 40_000 });

      const { documento, ventana } = await page.evaluate(() => ({
        documento: document.documentElement.scrollWidth,
        ventana: window.innerWidth,
      }));
      // Sin margen de tolerancia a propósito: un solo píxel de más ya es scroll
      // horizontal, y es así como empezó esto.
      expect(documento, `${nombre} obliga a hacer scroll lateral`).toBeLessThanOrEqual(ventana);
    });
  }

  test('la navegación sigue siendo alcanzable entera, aunque no quepa', async ({ page }) => {
    // No basta con que no desborde: si las secciones se recortaran o se
    // escondieran, el panel "cabría" y sería inservible. Tienen que estar todas
    // y poder llegarse a ellas desplazando la barra.
    await mockPanel(page);
    await page.setViewportSize(MOVIL);
    await page.goto('/interno');
    await page.getByText('Uso de la plataforma').waitFor({ timeout: 40_000 });

    for (const etiqueta of ['Resumen', 'Estudios', 'Facturación', 'Crecimiento', 'Auditoría', 'Equipo']) {
      await expect(page.getByRole('link', { name: etiqueta })).toHaveCount(1);
    }
    const nav = page.locator('header nav');
    const puedeDesplazarse = await nav.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(puedeDesplazarse, 'las seis secciones no caben, así que la barra tiene que desplazarse').toBe(true);
    await page.getByRole('link', { name: 'Equipo' }).click();
    // Timeout explícito: con `next dev`, la primera navegación a /interno/equipo
    // compila la ruta bajo demanda y se pasa de los 5s por defecto.
    await expect(page).toHaveURL(/\/interno\/equipo$/, { timeout: 30_000 });
  });

  test('las barras del gráfico de altas se dibujan de verdad', async ({ page }) => {
    // Colgaban de una columna sin altura, así que el `height: N%` resolvía a
    // cero: el gráfico salía vacío, con los números y los meses pero sin una
    // sola barra. Un gráfico vacío se lee como "no hay altas".
    await mockPanel(page);
    await page.setViewportSize(MOVIL);
    await page.goto('/interno');
    await page.getByText('Altas por mes').waitFor({ timeout: 40_000 });

    const alturas = await page.locator('.bg-brand\\/80').evaluateAll(
      els => els.map(e => e.getBoundingClientRect().height),
    );
    expect(alturas.length).toBe(2);
    expect(Math.min(...alturas), 'ninguna barra puede tener altura cero').toBeGreaterThan(4);
    expect(Math.max(...alturas), 'la barra del mes con más altas tiene que ser la más alta')
      .toBeGreaterThan(Math.min(...alturas));
  });

  test('en escritorio la cabecera vuelve a ser una sola fila', async ({ page }) => {
    // El control: sin esto, "arreglar el móvil" podría haber dejado el
    // escritorio con la navegación colgando en una segunda línea para siempre.
    await mockPanel(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/interno');
    await page.getByText('Uso de la plataforma').waitFor({ timeout: 40_000 });

    const marca = await page.getByText('Internal').boundingBox();
    const equipo = await page.getByRole('link', { name: 'Equipo' }).boundingBox();
    expect(marca && equipo && Math.abs(marca.y - equipo.y) < 20, 'marca y navegación en la misma fila').toBe(true);
    // Y el cargo, que en móvil se esconde, aquí se ve.
    await expect(page.getByText('Fundador y CEO')).toBeVisible();
  });
});
