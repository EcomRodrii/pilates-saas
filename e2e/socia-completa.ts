import { type Page, type Route } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, SESION_ID, AHORA, fixtureSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// «Socia completa» — el andamiaje que contesta a TODO lo que la app pregunta.
//
// ⚠️ Existe porque `sembrarSociaLista` contesta a **4 de los 27 endpoints** que
// la app de la alumna llama de verdad (medido con un grep de `fetch(` sobre
// `lib/student`, `components/student` y `app/portal`). Los otros 23 caían al
// backend dummy de la suite, cada pantalla pintaba su estado de fallo, y ese
// estado de fallo se lee EXACTAMENTE igual que un bug:
//
//   · «El pase aparece aquí el día de la clase» el mismo día de la clase
//     → no había mock de `/api/public/pase`.
//   · «Todavía no está disponible» en la valoración de un estudio que la tiene
//     activa → no había mock de `/api/public/valoracion`.
//   · Preferencias en blanco, sin error ni esqueleto
//     → no había mock de `/api/notifications/preferences`.
//
// Los tres se investigaron como si fueran defectos del producto. No lo eran.
//
// **El guardia es la parte importante de este fichero.** Un catch-all sobre
// `**/api/**` se registra el PRIMERO —en Playwright gana la última ruta
// registrada, así que las específicas de abajo lo pisan— y apunta cualquier
// llamada que nadie haya cubierto. `sinMockear()` devuelve esa lista: un test
// que la exija vacía no puede volver a confundir «no lo mockeé» con «está roto»,
// y una pantalla nueva que llame a un endpoint nuevo se caza sola.
//
// Ver [[e2e-test-1-siembra-cualquier-slug]] y
// [[playwright-catch-all-api-tambien-alcanza-iframes]].
// ─────────────────────────────────────────────────────────────────────────────

export { SLUG, STUDIO_ID, SOCIO_ID, SESION_ID, AHORA };

export interface OpcionesSocia {
  /** Sesiones que le quedan en el bono. `null` = sin bono. */
  bono?: number | null;
  /** Tiene reserva confirmada en la clase del fixture. */
  reservada?: boolean;
  /** Aforo ocupado por OTRAS personas (además de la suya, si la tiene). */
  ocupadas?: number;
  /** El estudio vende algo. */
  conTienda?: boolean;
  /** Avisos en la bandeja. */
  avisos?: Array<{ id: string; title: string; body: string; category: string; eventType: string; leido?: boolean }>;
  /** Publicaciones del tablón. */
  posts?: number;
  /** Conversaciones abiertas con el estudio. */
  conversaciones?: number;
  /** El estudio tiene la valoración inicial activa. */
  valoracionActiva?: boolean;
  /** Tarjeta guardada. */
  conTarjeta?: boolean;
  /** Recibos en el historial. */
  recibos?: number;
  /**
   * No fijar el reloj del navegador.
   *
   * ⚠️ `page.clock.install()` **vacía la Performance API**. Medido en esta app:
   * sin él una pantalla trae 1 entrada de `navigation` y 44 de `resource`; con
   * él, **0 y 0**. O sea que cualquier medida de tiempos o de bytes sale a cero
   * y parece que la página no carga nada — que es exactamente lo que pareció al
   * intentar medir el rendimiento por primera vez, y costó dos rondas
   * entenderlo.
   *
   * El precio de quitarlo es que las fechas del fixture (la clase es del
   * 12-ago-2026) quedan en el pasado: NO vale para nada que dependa de «hoy»,
   * solo para medir.
   */
  sinReloj?: boolean;
}

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** Milisegundos hasta el inicio de la clase del fixture, desde el reloj fijo. */
function minutosHastaLaClase(): number {
  const inicio = new Date('2026-08-12T10:00:00').getTime();
  return Math.max(0, Math.round((inicio - new Date(AHORA).getTime()) / 60_000));
}

export interface Andamiaje {
  /** Endpoints que la app pidió y NADIE mockeó. Debe estar vacío. */
  sinMockear: () => string[];
  /** Cuántas veces se llamó a cada endpoint, para exigir que algo se intentó. */
  llamadas: () => Record<string, number>;
}

export async function sembrarSociaCompleta(page: Page, o: OpcionesSocia = {}): Promise<Andamiaje> {
  const {
    bono = 5, reservada = false, ocupadas = 0, conTienda = true, avisos = [],
    posts = 0, conversaciones = 0, valoracionActiva = false, conTarjeta = false, recibos = 0,
  } = o;

  const sinMockear: string[] = [];
  const llamadas: Record<string, number> = {};
  const contar = (r: Route) => {
    const p = new URL(r.request().url()).pathname;
    llamadas[p] = (llamadas[p] ?? 0) + 1;
  };

  if (!o.sinReloj) await page.clock.install({ time: new Date(AHORA) });
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

  // ── 1. El guardia. PRIMERO a propósito: gana la última ruta registrada. ──
  await page.route('**/api/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    sinMockear.push(p);
    contar(r);
    return r.fulfill(json({ error: `ENDPOINT SIN MOCKEAR EN socia-completa.ts: ${p}` }, 500));
  });

  // Supabase directo (no es `/api/`): red de seguridad aparte.
  await page.route('**/rest/v1/**', (r) => r.fulfill({
    ...json({ id: STUDIO_ID }), headers: { 'access-control-allow-origin': '*' },
  }));

  // ── 2. El payload del estudio, coherente consigo mismo. ──
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const socia = f.socio as Record<string, unknown> ?? (f.socia as Record<string, unknown>);
  const s = f.socia as Record<string, unknown>;
  const socio = s.socio as Record<string, unknown>;
  void socia;

  f.planesTarifa = conTienda
    ? [
        { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
        { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 89, activo: true, periodicidadMeses: 1 },
      ]
    : [];

  s.suscripciones = bono === null ? [] : [{
    id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA',
    sesionesRestantes: bono, fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
  }];

  s.reservas = reservada
    ? [{ id: 'res-1', socioId: SOCIO_ID, sesionId: SESION_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T09:00:00Z' }]
    : [];

  // ⚠️ El aforo se DERIVA de la reserva, no se escribe aparte. Escribirlos por
  // separado fue lo que hizo que una ficha dijera «10 libres» con la alumna ya
  // reservada — y eso también se investigó como si fuera un bug.
  const filasAforo = [
    ...Array.from({ length: ocupadas }, (_, i) => ({ id: `ar-otra-${i}`, sesion_id: SESION_ID, estado: 'CONFIRMADA' })),
    ...(reservada ? [{ id: 'ar-mia', sesion_id: SESION_ID, estado: 'CONFIRMADA' }] : []),
  ];
  f.aforoReservas = filasAforo;

  s.recibos = Array.from({ length: recibos }, (_, i) => ({
    id: `rec-${i + 1}`, socioId: SOCIO_ID, concepto: i === 0 ? 'Bono 8 sesiones' : 'Mensual ilimitado',
    importe: i === 0 ? 96 : 89, estado: i === 0 ? 'COBRADO' : 'PENDIENTE',
    fechaCobro: i === 0 ? '2026-08-01' : null, fechaVencimiento: i === 0 ? null : '2026-09-01',
    metodoCobro: i === 0 ? 'TARJETA' : 'SEPA', suscripcionId: i === 0 ? 'sus-1' : null,
  }));

  if (conTarjeta) {
    socio.tarjetaUltimos4 = '4242';
    socio.tarjetaMarca = 'Visa';
    socio.tarjetaExpMes = 12;
    socio.tarjetaExpAnio = 2029;
  }

  // ── 3. Los 27 endpoints. ──
  const ruta = (test: (p: string) => boolean, responder: (r: Route) => unknown) =>
    page.route((u) => test(u.pathname), (r) => { contar(r); return responder(r) as void; });

  await page.route('**/api/theme**', (r) => { contar(r); return r.fulfill(json({ primary: '#3E6B4A', secondary: '#3E6B4A', logoUrl: null, radius: 12 })); });
  await page.route('**/api/public/studio-data', (r) => { contar(r); return r.fulfill(json(f)); });
  await page.route('**/api/public/aforo**', (r) => { contar(r); return r.fulfill(json({ sesionIds: [SESION_ID], aforoReservas: filasAforo })); });

  await ruta((p) => p === '/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' })));

  // Avisos y preferencias.
  await ruta((p) => p === '/api/notifications', (r) => r.fulfill(json({
    items: avisos.map((a) => ({
      id: a.id, title: a.title, body: a.body, category: a.category, eventType: a.eventType,
      createdAt: '2026-08-11T18:00:00Z', readAt: a.leido ? '2026-08-11T19:00:00Z' : null,
    })),
    unread: avisos.filter((a) => !a.leido).length,
  })));
  await ruta((p) => p === '/api/notifications/preferences', (r) => r.fulfill(json({
    prefs: {
      reservas: { inapp: true, push: true, email: false },
      clases: { inapp: true, push: true, email: false },
      pagos: { inapp: true, push: false, email: true },
      marketing: { inapp: true, push: false, email: false },
    },
  })));
  await ruta((p) => p === '/api/notifications/subscribe', (r) => r.fulfill(json({ ok: true })));

  // El pase de acceso. ⚠️ `hayPase` con `reservaId` de la reserva del fixture:
  // el endpoint devuelve SIEMPRE el de la próxima clase, y la pantalla de
  // detalle compara ese id con el suyo (`pase.reservaId === res.id`).
  await ruta((p) => p === '/api/public/pase', (r) => r.fulfill(json(
    reservada
      ? {
          hayPase: true, reservaId: 'res-1', vigente: false, yaAsistida: false,
          minutosParaActivarse: minutosHastaLaClase() - 60,
          seActivaA: '2026-08-12T09:00:00.000Z', paseHasta: '2026-08-12T10:15:00.000Z',
          inicio: '2026-08-12T10:00:00', token: null, codigo: null,
        }
      : { hayPase: false },
  )));

  await ruta((p) => p === '/api/public/valoracion', (r) => r.fulfill(json({
    activa: valoracionActiva, conSalud: false, historial: null,
  })));

  await ruta((p) => p === '/api/public/socio', (r) => r.fulfill(json({ ok: true })));
  await ruta((p) => p === '/api/public/favoritos', (r) => r.fulfill(json({ favoritos: [] })));
  await ruta((p) => p === '/api/public/retos', (r) => r.fulfill(json({ ok: true })));
  await ruta((p) => p === '/api/public/foto-perfil', (r) => r.fulfill(json({ ok: true, url: null })));
  await ruta((p) => p === '/api/public/reserva', (r) => r.fulfill(json({ estado: 'CONFIRMADA', reservaId: 'res-1' })));
  await ruta((p) => p === '/api/public/aceptar-oferta-espera', (r) => r.fulfill(json({ ok: true })));
  await ruta((p) => p === '/api/public/canje', (r) => r.fulfill(json({ ok: true })));
  await ruta((p) => p === '/api/public/valorar-clase', (r) => r.fulfill(json({ ok: true })));
  await ruta((p) => p === '/api/public/validar-codigo-descuento', (r) => r.fulfill(json({ valido: false })));
  await ruta((p) => p === '/api/public/checkout-embebido', (r) => r.fulfill(json({ clientSecret: null })));
  await ruta((p) => p === '/api/stripe/checkout', (r) => r.fulfill(json({ url: null })));

  // Sin factura emitida es el caso NORMAL: 35 de 73 recibos de producción no la
  // llevan. El 404 es lo que devuelve el endpoint, y `getFacturaDeRecibo` lo
  // traduce a `null`.
  await ruta((p) => p === '/api/public/factura', (r) => r.fulfill(json({ error: 'Sin factura' }, 404)));

  // Tablón.
  await ruta((p) => p === '/api/public/comunidad/posts', (r) => r.fulfill(json({
    posts: Array.from({ length: posts }, (_, i) => ({
      id: `post-${i}`, texto: `Publicación ${i + 1} del estudio.`, imagenUrl: null,
      autorNombre: 'Estudio Alma', autorInicial: 'E', creadoEn: '2026-08-10T10:00:00Z',
      likes: 0, likedByMe: false, comentariosCount: 0, tipo: 'TEXTO',
      eventoFecha: null, eventoAforo: null, eventoLugar: null,
    })),
  })));
  await ruta((p) => p.startsWith('/api/public/comunidad/'), (r) => r.fulfill(json({ comentarios: [], liked: false, likes: 0 })));

  // Mensajería.
  await ruta((p) => p === '/api/public/mensajeria/conversaciones', (r) => r.fulfill(json({
    conversaciones: Array.from({ length: conversaciones }, (_, i) => ({
      id: `conv-${i}`, studio_id: STUDIO_ID, tipo: 'ALUMNA_ESTUDIO', socio_id: SOCIO_ID,
      instructor_id: null, creada_en: '2026-08-01T10:00:00Z', actualizada_en: '2026-08-10T10:00:00Z',
      ultimoMensaje: 'Hola, ¿en qué podemos ayudarte?', ultimoMensajeEn: '2026-08-10T10:00:00Z',
      sinLeer: 0, participantes: [],
    })),
  })));
  await ruta((p) => p.startsWith('/api/public/mensajeria/'), (r) => r.fulfill(json({ mensajes: [], ok: true })));

  return { sinMockear: () => [...sinMockear], llamadas: () => ({ ...llamadas }) };
}
