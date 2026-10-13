import { expect, test, type Page } from '@playwright/test';
import { STUDIO_ID, json, montarAlta } from './onboarding-andamio';
import { CAPITULOS, TODOS_LOS_PASOS, tabDe, type PasoVisita } from '../lib/tour/capitulos.ts';

// El recorrido ENTERO, paso a paso: cada uno de los 43 pasos se carga en SU pantalla (y su pestaña de
// Configuración) y se comprueba que la visita ENCUENTRA lo que dice señalar: el anillo aparece y no
// sale «No encuentro el recuadro». Es lo que un fundador descubrió a mano («pum, no existe»); aquí
// lo descubre el CI.
//
// Estudio nuevo y vacío (sin clientas): los pasos que necesitan una ficha de clienta enseñan su
// «hace falta una clienta», que también es un comportamiento correcto y se comprueba.
const BIENVENIDA = '2026-10-07T10:00:00Z';
const NECESITAN_CLIENTA = new Set(['c4.3', 'c5.4', 'c5.5']);

function progresoAntesDe(paso: PasoVisita, saltan: ReadonlySet<string>) {
  const todos = TODOS_LOS_PASOS;
  const i = todos.findIndex(p => p.id === paso.id);
  const previos = todos.slice(0, i).filter(p => !saltan.has(p.id));
  const capitulo = CAPITULOS.find(c => paso.id.startsWith(`${c.id}.`))!;
  const cerrados = CAPITULOS.filter(c => c.pasos.every(p => todos.findIndex(x => x.id === p.id) < i));
  return {
    v: 1, inicio: true, hechos: previos.map(p => p.id), aplazados: [],
    vistos: cerrados.map(c => c.id), abiertos: [...cerrados.map(c => c.id), capitulo.id],
  };
}

// Respuestas mínimas pero VÁLIDAS de las pantallas que no soportan un `{}` (Centro de Control, Caja)
// y la prueba gratuita en marcha (de ella depende que exista la píldora de los días que quedan).
const DECISIONES = {
  resumen: { saludo: 'Buenas tardes', mientrasDormias: [], nDecisiones: 0, tiempoEstimadoMin: 0, impactoTotal: null, generadoEn: '2026-10-07T10:00:00Z' },
  seguimiento: [], porEspecialista: [], actividad: [], prioridades: [], masSituaciones: [], nAutonomasHoy: 0, nAutonomasFallidasHoy: 0,
  veredicto: { recomendacion: null, fraseConfianza: null, semanaTranquila: false },
};
const CATALOGO = {
  ivaDefecto: 21, cobro: { stripeConectado: false, datafonoEmparejado: false }, productos: [], planes: [],
  caja: { id: 'caja-1', fondoInicial: 0, abiertaEn: '2026-10-07T08:00:00Z', abiertaPor: 'Marcos' },
  hoy: { ventas: 0, total: 0, ticketMedio: 0, porMetodo: [], ultimas: [] },
};
const PRUEBA = {
  plan: 'ESTUDIO', subscriptionStatus: 'trialing', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
  enPrueba: true, pruebaTermina: '2026-10-14T10:00:00Z', periodoTermina: '2026-10-14T10:00:00Z',
  trial: { fase: 'PLENA', diasRestantes: 6, finaliza: '2026-10-14T10:00:00Z' },
};

async function montar(page: Page, progreso: unknown) {
  await montarAlta(page, {
    estudio: { bienvenida_vista_en: BIENVENIDA },
    antes: async (p) => {
      await p.route('**/api/billing/status**', route => json(route, PRUEBA));
      await p.route(u => u.pathname === '/api/decisiones', route => json(route, DECISIONES));
      await p.route('**/api/pos/catalogo**', route => json(route, CATALOGO));
      await p.route('**/rest/v1/studios**', route => route.request().method() === 'PATCH' ? json(route, [{ id: STUDIO_ID }]) : json(route, {
        id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', color_primario: '#4F46E5', owner_auth_user_id: 'auth-e2e-duena',
        bienvenida_vista_en: BIENVENIDA, tour_obligatorio: true, tour_progreso: progreso, tour_completado_en: null,
      }));
    },
  });
}

const VISTAS = [
  { nombre: 'escritorio', ancho: 1280, alto: 800, saltan: new Set(['c8.4']), cierra: /Capítulo 8 completado/ },
  // En móvil no existe el buscador de arriba: ese paso se salta y el capítulo 1 se cierra sin él.
  { nombre: 'móvil', ancho: 390, alto: 844, saltan: new Set(['c8.4', 'c1.3']), cierra: null },
] as const;

for (const vista of VISTAS) test.describe(`Recorrido completo de la visita guiada · ${vista.nombre}`, () => {
  for (const paso of TODOS_LOS_PASOS) {
    if (paso.ruta.endsWith('/*')) {
      if (!NECESITAN_CLIENTA.has(paso.id)) continue;
      test(`${paso.id} · ${paso.titulo}: sin clientas, dice que hace falta una`, async ({ page }) => {
        test.slow();
        await page.setViewportSize({ width: vista.ancho, height: vista.alto });
        await montar(page, progresoAntesDe(paso, vista.saltan));
        const tarjeta = page.getByRole('region', { name: `Visita guiada: ${paso.titulo}` });
        await expect(tarjeta).toBeVisible({ timeout: 60_000 });
        await expect(tarjeta).toContainText('hace falta al menos una clienta');
        await expect(tarjeta.getByRole('button', { name: 'Añadir una clienta' })).toBeVisible();
      });
      continue;
    }

    test(`${paso.id} · ${paso.titulo}: encuentra lo que señala`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width: vista.ancho, height: vista.alto });
      await montar(page, progresoAntesDe(paso, vista.saltan));
      // Se carga la pantalla del paso (con su pestaña, si la tiene), como hace «Llévame».
      await page.goto(paso.href ?? paso.ruta);

      if (vista.saltan.has(paso.id)) {
        // La visita lo salta: nunca sale su tarjeta, y pasa a lo siguiente (el cierre de su capítulo).
        const capitulo = CAPITULOS.find(c => paso.id.startsWith(`${c.id}.`))!;
        await expect(page.getByRole('dialog', { name: new RegExp(`Capítulo \\d+ completado`) })).toBeVisible({ timeout: 60_000 });
        await expect(page.getByRole('dialog', { name: /completado/ })).toContainText(capitulo.titulo);
        await expect(page.getByRole('region', { name: `Visita guiada: ${paso.titulo}` })).toHaveCount(0);
        return;
      }

      const tarjeta = page.getByRole('region', { name: `Visita guiada: ${paso.titulo}` });
      await expect(tarjeta).toBeVisible({ timeout: 60_000 });
      // Está en SU sitio (ruta y pestaña): nada de «Este paso está en …».
      await expect(tarjeta).not.toContainText('Este paso está en');
      // Lo encuentra: aparece el anillo y la tarjeta NO dice que no lo encuentra.
      await expect(page.getByTestId('visita-anillo')).toBeVisible({ timeout: 30_000 });
      await expect(tarjeta).not.toContainText('No encuentro el recuadro');
      // Y lo que dice hacer lleva el nombre de la pantalla (no un texto vacío).
      await expect(tarjeta).toContainText(paso.accion.slice(0, 20));
      void tabDe;
    });
  }
});
