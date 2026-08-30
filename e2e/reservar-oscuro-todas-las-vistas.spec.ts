import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El widget sobre una web OSCURA, en TODAS sus vistas.
//
// ⚠️ Este fichero existe porque la verificación anterior se quedó corta y es
// mejor decirlo que taparlo. El barrido de superficies claras de
// `reservar-acoplar-widget.spec.ts` mide UNA pantalla: la pestaña «Clases» en
// vista Día. Con eso se dieron por cerrados tres arreglos seguidos (#981, #982,
// #984) — y los tres aparecieron por vías distintas, ninguna de ellas visible
// leyendo el código:
//   · blancos translúcidos escritos a mano,
//   · `RT`, un objeto de tokens fijado a `MODO_TOKENS.dia` a nivel de módulo,
//   · el calendario, que no lee variables CSS sino que recibe los tokens por
//     prop, y el `<body>` del iframe, que pintaba su fondo opaco por debajo.
//
// Tres canales para lo mismo en una sola pantalla. Dar por hecho que las otras
// —las tres pestañas restantes, las vistas Lista/Mes/Semana y la hoja de
// reserva— están bien porque una lo está es exactamente el salto que ya falló
// tres veces seguidas.
//
// El criterio es el mismo y a propósito: se CUENTAN superficies barriendo el
// DOM, no se comprueba un elemento concreto. Un elemento concreto solo prueba
// el canal que ya conocías.
// ─────────────────────────────────────────────────────────────────────────────

// 180 s como el resto de specs de /reservar: la primera petición COMPILA la
// ruta, y con los 30 s por defecto el arranque en frío se lee como «la página
// no carga» en vez de como lo que es.
test.setTimeout(180_000);

const SLUG = 'tentare';
const S = 'studio-test';

function fx() {
  const mk = (d: string, h: string, id: string) => ({
    id, studioId: S, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: `2026-08-${d}T${h}:00:00`, fin: `2026-08-${d}T${h}:50:00`,
    aforoMaximo: 10, cancelada: false,
  });
  return {
    studio: {
      id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', direccion: 'Calle Larios 1',
      email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12,
      descripcion: 'Estudio pequeño.', anioFundacion: 2016, colorPrimario: '#2C352C',
    },
    tiposClase: [{ id: 'tc-r', studioId: S, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: S, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Con planes: la pestaña de bonos y el selector de producto son superficie
    // propia, y sin ellos no se pintan.
    planesTarifa: [
      { id: 'p1', nombre: 'Bono 5 clases', tipo: 'BONO', precio: 75, sesiones: 5, activo: true, descripcion: null },
      { id: 'p2', nombre: 'Mensual ilimitado', tipo: 'MENSUAL', precio: 89, sesiones: null, activo: true, descripcion: null },
    ],
    // Varios días con clase: la vista Mes pinta celdas con densidad y la Semana
    // una rejilla — dos superficies que la vista Día no tiene.
    sesiones: [mk('12', '10', 's1'), mk('12', '18', 's2'), mk('13', '09', 's3'), mk('14', '19', 's4')],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [{ id: 'cs-1', studioId: S, nombre: 'Valoración postural', duracionMin: 45, precio: 40, activo: true, descripcion: null }],
    citasDisponibilidad: [], aforoReservas: [], socia: null,
  };
}

async function mocks(page: Page) {
  await page.clock.install({ time: new Date('2026-08-12T08:00:00') });
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx()) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'no' }) }));
}

/**
 * Cuántas superficies quedan CLARAS, y cuáles.
 *
 * Se ignora lo diminuto (un punto de 6 px no es una superficie) y lo muy
 * translúcido (un borde claro sobre fondo oscuro es legítimo). Devuelve el
 * `style` en línea de cada culpable: sin eso, un fallo dice «hay 3» y toca
 * buscarlas a mano.
 */
async function clarasEn(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      const caja = el.getBoundingClientRect();
      if (caja.width < 40 || caja.height < 20) continue;
      const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(s.backgroundColor);
      if (!m) continue;
      const alfa = m[4] === undefined ? 1 : Number(m[4]);
      if (alfa > 0.3 && Number(m[1]) > 200 && Number(m[2]) > 200 && Number(m[3]) > 200) {
        out.push(`${s.backgroundColor} <${el.tagName.toLowerCase()}> ${(el.getAttribute('style') ?? '').slice(0, 90)}`);
      }
    }
    return out;
  });
}

async function abrirOscuro(page: Page, tab: string) {
  await page.goto(`/reservar/${SLUG}?embed=1&tab=${tab}&fondo=transparente&texto=claro`);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await mocks(page);
});

for (const tab of ['clases', 'citas', 'reservas', 'estudio'] as const) {
  test(`la pestaña «${tab}» no deja ninguna superficie clara`, async ({ page }) => {
    await abrirOscuro(page, tab);
    await page.locator('#horario').waitFor({ timeout: 150_000 });
    await page.waitForTimeout(900);
    const claras = await clarasEn(page);
    expect(claras, `pestaña ${tab}:\n${claras.join('\n')}`).toEqual([]);
  });
}

// Las vistas Lista/Mes/Semana ya no son alcanzables desde el widget público
// (rediseño sobre el handoff design_handoff_widget_reservas: solo queda la
// vista Día) — sus tests de superficies claras se retiraron con ellas.

test('la hoja de reserva no deja ninguna superficie clara', async ({ page }) => {
  // La superficie más grande que se abre ENCIMA de todo, y la única que la
  // clienta mira con la tarjeta en la mano. Se abre desde la vista Día, que es
  // donde está el botón de reservar.
  await abrirOscuro(page, 'clases');
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  // Por la etiqueta COMPLETA de la tarjeta, no por «Reservar»: esa palabra vive
  // dentro del botón, pero el nombre accesible lo forma toda la tarjeta
  // («Reformer a las 10:00, con Ana, 10 plazas»), así que buscar «Reservar» no
  // encuentra nada — y el fallo se lee como si la hoja no existiera.
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  // ⚠️ Se comprueba que la pantalla siguiente ESTÁ ABIERTA antes de contar.
  // Sin esto, un clic que no abriera nada dejaría el test midiendo la misma
  // pantalla del test de arriba y dando verde sin haber mirado nada jamás —
  // el mismo test hueco que ya se coló dos veces en esta misma tanda.
  //
  // Petición explícita del fundador (2026-08-30, "no quiero que se coma 3
  // pantallas seguidas"): una invitada sin sesión ya no pasa por la ficha
  // de detalle — un tap en la tarjeta lleva DIRECTO al flujo de acceso
  // ("Entra para reservar"), que es ahora la superficie más grande que se
  // abre encima de todo.
  await expect(page.getByRole('heading', { name: /entra para reservar/i })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900);
  const claras = await clarasEn(page);
  expect(claras, `hoja de reserva:\n${claras.join('\n')}`).toEqual([]);
});
