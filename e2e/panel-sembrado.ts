import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Andamiaje del panel con datos SEMBRADOS, compartido por las suites que
// necesitan un panel que parezca un estudio en marcha y no uno recién abierto:
// la captura visual (`panel-captura.spec.ts`) y el barrido de contraste
// (`panel-contraste.spec.ts`).
//
// Vivía dentro de la suite de capturas. Se saca aquí en vez de copiarlo, mismo
// criterio que `socia-lista.ts`: dos copias de un sembrado divergen, y la que
// afirma algo acaba afirmándolo sobre otra pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID = 'auth-e2e-duena';

const hoy = new Date();
const dia = (n: number) => {
  const d = new Date(hoy);
  d.setDate(d.getDate() + n);
  return d;
};
const iso = (d: Date, h = 9, m = 0) => {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};
const fecha = (d: Date) => d.toISOString().slice(0, 10);

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID, email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
};

const EQUIPO = [
  { id: 'ins-cloe', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol: 'PROPIETARIO', color: '#343825', auth_user_id: UID },
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#D9C29E', auth_user_id: 'auth-marta' },
  { id: 'ins-ana', studio_id: STUDIO_ID, nombre: 'Ana Peña', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: 'auth-ana' },
];

const SOCIOS = [
  { id: 'soc-1', studio_id: STUDIO_ID, nombre: 'María', apellidos: 'García Fernández', email: 'maria@example.com', telefono: '600111222', activo: true, fecha_alta: '2026-01-10T09:00:00+00:00', lead_stage: 'ACTIVA', campos_extra: {}, tags: ['reformer'] },
  { id: 'soc-2', studio_id: STUDIO_ID, nombre: 'Laura', apellidos: 'Martín', email: 'laura@example.com', telefono: '600333444', activo: true, fecha_alta: '2026-03-02T09:00:00+00:00', lead_stage: 'ACTIVA', campos_extra: {}, tags: [] },
  { id: 'soc-3', studio_id: STUDIO_ID, nombre: 'Carmen', apellidos: 'Del Río Sánchez', email: 'carmen@example.com', telefono: '600555666', activo: true, fecha_alta: '2026-06-18T09:00:00+00:00', lead_stage: 'PRUEBA', campos_extra: {}, tags: ['nueva'] },
  { id: 'soc-4', studio_id: STUDIO_ID, nombre: 'Bea', apellidos: 'Ortega', email: 'bea@example.com', telefono: '600777888', activo: false, fecha_alta: '2025-11-05T09:00:00+00:00', lead_stage: 'BAJA', campos_extra: {}, tags: [] },
];

const PLANES = [
  { id: 'pl-bono10', studio_id: STUDIO_ID, nombre: 'Bono 10 clases', precio: 130, tipo: 'BONO', sesiones: 10, validez_dias: 90, activo: true },
  { id: 'pl-mensual', studio_id: STUDIO_ID, nombre: 'Mensual ilimitado', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true },
  { id: 'pl-suelta', studio_id: STUDIO_ID, nombre: 'Clase suelta', precio: 15, tipo: 'PUNTUAL', sesiones: 1, validez_dias: 30, activo: true },
];

const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'pl-bono10', estado: 'ACTIVA', fecha_inicio: fecha(dia(-30)), fecha_fin: fecha(dia(60)), sesiones_restantes: 6, stripe_subscription_id: null },
  { id: 'sus-2', studio_id: STUDIO_ID, socio_id: 'soc-2', plan_id: 'pl-mensual', estado: 'ACTIVA', fecha_inicio: fecha(dia(-10)), fecha_fin: fecha(dia(20)), sesiones_restantes: null, stripe_subscription_id: 'sub_x' },
  { id: 'sus-3', studio_id: STUDIO_ID, socio_id: 'soc-3', plan_id: 'pl-suelta', estado: 'ACTIVA', fecha_inicio: fecha(dia(-2)), fecha_fin: fecha(dia(28)), sesiones_restantes: 1, stripe_subscription_id: null },
];

const SALAS = [
  { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 6, color: '#343825' },
  { id: 'sala-2', studio_id: STUDIO_ID, nombre: 'Sala Mat', capacidad: 12, color: '#D9C29E' },
];

// ⚠️ Colores REALES de `tipos_clase` en producción, no inventados. Estaban en
// `#343825` (el oliva casi negro de la marca) y `#D9C29E`, que NO los usa ningún
// estudio: los de verdad son pasteles — #F7A6C4 en 11 tipos, #7FB2E5 en 8,
// #8FC98A en 6, #E8B45C en 3.
//
// La diferencia no es cosmética. El fondo del chip del calendario es
// `color-mix(tipo.color, var(--card))`, y el porcentaje de mezcla
// (`--calendario-tinte-clase`) está CALIBRADO contra esos pasteles: su comentario
// en globals.css dice «al 50 % el peor contraste con el texto sigue en 5,1:1».
// Con un casi-negro sembrado, ese cálculo no vale y el barrido de contraste
// reporta fallos de un chip que ningún estudio ve.
const TIPOS = [
  { id: 'tc-reformer', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4', activo: true },
  { id: 'tc-mat', studio_id: STUDIO_ID, nombre: 'Mat', duracion_min: 50, color: '#7FB2E5', activo: true },
];

const SESIONES = [-1, 0, 0, 1, 1, 2, 3].map((d, i) => ({
  id: `ses-${i}`, studio_id: STUDIO_ID,
  tipo_clase_id: i % 2 ? 'tc-mat' : 'tc-reformer',
  sala_id: i % 2 ? 'sala-2' : 'sala-1',
  instructor_id: i % 2 ? 'ins-marta' : 'ins-cloe',
  inicio: iso(dia(d), 9 + (i % 4) * 2, 0),
  fin: iso(dia(d), 9 + (i % 4) * 2, 50),
  aforo_maximo: i % 2 ? 12 : 6,
  cancelada: false, notas: null, google_event_id: null, serie_id: null,
  incidencia_texto: null, precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
}));

const RESERVAS = SESIONES.flatMap((s, i) =>
  SOCIOS.slice(0, (i % 3) + 1).map((soc, j) => ({
    id: `res-${i}-${j}`, studio_id: STUDIO_ID, sesion_id: s.id, socio_id: soc.id,
    estado: 'CONFIRMADA', spot_id: null, posicion_espera: null, oferta_expira_en: null,
    check_in_en: null, creado_en: iso(dia(-3)), confirmacion_pedida_en: null,
    confirmado_en: null, recordatorio_confirmacion_en: null,
    valoracion_experiencia: null, cancelada_tardia: false,
  })),
);

const RECIBOS = [
  { id: 'rec-1', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: 'sus-1', concepto: 'Bono 10 clases', importe: 130, estado: 'COBRADO', fecha_vencimiento: fecha(dia(-30)), fecha_cobro: fecha(dia(-30)), fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'TARJETA' },
  { id: 'rec-2', studio_id: STUDIO_ID, socio_id: 'soc-2', suscripcion_id: 'sus-2', concepto: 'Mensual ilimitado — septiembre', importe: 89, estado: 'PENDIENTE', fecha_vencimiento: fecha(dia(-4)), fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 1, metodo_cobro: null },
  { id: 'rec-3', studio_id: STUDIO_ID, socio_id: 'soc-3', suscripcion_id: 'sus-3', concepto: 'Clase suelta', importe: 15, estado: 'COBRADO', fecha_vencimiento: fecha(dia(-2)), fecha_cobro: fecha(dia(-2)), fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'EFECTIVO' },
  { id: 'rec-4', studio_id: STUDIO_ID, socio_id: 'soc-4', suscripcion_id: null, concepto: 'Mensual ilimitado — agosto', importe: 89, estado: 'FALLIDO', fecha_vencimiento: fecha(dia(-35)), fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 3, metodo_cobro: null },
  { id: 'rec-5', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: null, concepto: 'Calcetines Pilates', importe: 25, estado: 'COBRADO', fecha_vencimiento: fecha(dia(-1)), fecha_cobro: fecha(dia(-1)), fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'EFECTIVO' },
];

const FACTURAS = [
  { id: 'fac-1', studio_id: STUDIO_ID, recibo_id: 'rec-1', venta_pos_id: null, numero_completo: 'A-2026-0041', fecha_emision: fecha(dia(-30)), receptor_nombre: 'María García Fernández', receptor_nif: null, base_imponible: 107.44, tipo_iva: 21, cuota_iva: 22.56, total: 130, verifactu_hash: 'abc', verifactu_prev_hash: null, verifactu_ts: iso(dia(-30)), verifactu_seq: 41, verifactu_estado: 'ACEPTADA', verifactu_csv: 'CSV-1', serie: 'A', tipo: 'F2', rectifica_a: null, tipo_rectificativa: null, importe_rectificacion: null, fiskaly_invoice_id: null, verifactu_qr_url: null, verifactu_qr_imagen: null },
];

const PRODUCTOS = [
  { id: 'p1', studio_id: STUDIO_ID, nombre: 'Calcetines Pilates', categoria: 'PRODUCTO', precio: 25, activo: true, stock: 12, stock_minimo: 5, descripcion: 'Antideslizantes', iva_pct: 21, sku: 'CAL-01', codigo_barras: null, imagen_url: null, orden: 0 },
  { id: 'p2', studio_id: STUDIO_ID, nombre: 'Botella Tentare', categoria: 'PRODUCTO', precio: 14.9, activo: true, stock: 3, stock_minimo: 5, descripcion: '750 ml', iva_pct: 21, sku: null, codigo_barras: null, imagen_url: null, orden: 1 },
];


// ─── Los endpoints `/api/*` que las pantallas piden de verdad ───────────────
//
// ⚠️ Medido con `sinSembrar()` sobre las 21 rutas del panel: **NO son 195**.
// El catálogo tiene ~200 endpoints, pero entre todas las pantallas solo se
// llaman **13** — y dos de ellos (`/api/notifications` y
// `/api/mensajeria/conversaciones`) los pide la CABECERA, así que salían en las
// 21. El resto es uno o dos por pantalla.
//
// Contestarlos con `{}` no reventaba nada visible, y por eso duró: cada
// pantalla pintaba su estado vacío. `centro-de-control` —el Centro de Control,
// la pantalla insignia— renderizaba **360 caracteres**.

const AVISOS_PANEL = [
  { id: 'nt-1', title: 'Reserva pendiente de aprobación', body: 'Carmen Del Río quiere entrar en Reformer de mañana a las 10:00.', category: 'reservas', eventType: 'reserva.pendiente_aprobacion', createdAt: iso(dia(0), 8, 5), readAt: null, deepLink: '/calendario' },
  { id: 'nt-2', title: 'Un recibo ha fallado', body: 'El de Laura Martín, 89 €. La tarjeta ha sido rechazada.', category: 'pagos', eventType: 'pago.fallido', createdAt: iso(dia(-1), 19, 30), readAt: null, deepLink: '/cobros' },
  { id: 'nt-3', title: 'Marta Ruiz no puede dar su clase', body: 'Mat del jueves a las 11:00. Ya se está buscando sustituta.', category: 'equipo', eventType: 'sustitucion.contactando', createdAt: iso(dia(-1), 9, 0), readAt: iso(dia(-1), 9, 10), deepLink: '/sustituciones' },
];

const CONVERSACIONES_PANEL = [
  { id: 'conv-1', studio_id: STUDIO_ID, tipo: 'ALUMNA_ESTUDIO', socio_id: 'soc-1', instructor_id: null, creada_en: iso(dia(-3), 10, 0), actualizada_en: iso(dia(0), 9, 12), ultimoMensaje: '¿Puedo cambiar mi clase del jueves?', ultimoMensajeEn: iso(dia(0), 9, 12), ultimo_remitente_auth_user_id: 'auth-maria', sinLeer: 2, participantes: [] },
  { id: 'conv-2', studio_id: STUDIO_ID, tipo: 'ALUMNA_ESTUDIO', socio_id: 'soc-3', instructor_id: null, creada_en: iso(dia(-8), 17, 0), actualizada_en: iso(dia(-2), 12, 0), ultimoMensaje: 'Gracias, ¡nos vemos el lunes!', ultimoMensajeEn: iso(dia(-2), 12, 0), ultimo_remitente_auth_user_id: UID, sinLeer: 0, participantes: [] },
];

/**
 * El Centro de Control con algo que decidir, que es su estado normal.
 *
 * ⚠️ Las formas están LEÍDAS de `app/api/decisiones/route.ts` y
 * `lib/decision/tipos.ts`, no inventadas. Inventarlas fue el primer intento y
 * el resultado es engañoso: los campos de primer nivel llegaban —el dashboard
 * pintaba «3 oportunidades»— pero el Centro de Control seguía renderizando
 * 352 caracteres, porque `veredicto`, `seguimiento`, `porEspecialista` y
 * `actividad` tenían otra forma. Un payload a medias no falla: enseña media
 * pantalla y parece que la pantalla está a medias.
 */
const rec = (o: Partial<Record<string, unknown>> & { id: string; especialista: string; tipo: string; titulo: string; motivo: string; score: number }) => ({
  studioId: STUDIO_ID, decisionSessionId: 'ds-1', algorithmVersion: 'v1',
  dedupeKey: `${o.especialista}:${o.id}`, datosUsados: {}, riesgo: 'BAJO',
  impacto: { valor: 0, unidad: 'EUR_MES', formula: '' },
  confianza: { nivel: 'MEDIA', evidencia: [], autonomiaMaxima: 'SUGERIR' },
  prioridad: 'MEDIA', nivelAutonomia: 'SUGERIR',
  accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: '' },
  socioId: null, sesionId: null, reciboId: null, tiempoEstimadoMin: 5,
  estado: 'PENDIENTE', vistaEn: null, expiraEn: iso(dia(7), 9, 0),
  creadoEn: iso(dia(0), 6, 0), resueltoEn: null,
  ...o,
});

const REC_ABRIR = rec({
  id: 'rec-1', especialista: 'INGRESOS', tipo: 'ABRIR_CLASE', score: 0.91,
  titulo: 'Abrir una segunda clase de Reformer los martes a las 11:00',
  motivo: 'Las últimas 5 semanas se llenó en menos de 24 h y quedaron 7 personas en lista de espera.',
  impacto: { valor: 320, unidad: 'EUR_MES', formula: '7 plazas × 4 semanas × 11,4 €' },
  confianza: { nivel: 'ALTA', evidencia: ['5 semanas llenas', '7 en lista de espera'], autonomiaMaxima: 'SUGERIR' },
  prioridad: 'ALTA',
});
const REC_RECUPERAR = rec({
  id: 'rec-2', especialista: 'RETENCION', tipo: 'RECUPERAR_SOCIA', score: 0.74,
  titulo: 'Bea Ortega lleva 6 semanas sin venir',
  motivo: 'Su bono caduca en 12 días con 4 sesiones dentro.',
  impacto: { valor: 130, unidad: 'EUR', formula: 'bono sin consumir' },
  socioId: 'soc-4', prioridad: 'ALTA',
});
const REC_HORARIO = rec({
  id: 'rec-3', especialista: 'AGENDA', tipo: 'REVISAR_HORARIO', score: 0.51,
  titulo: 'El Mat de los viernes a las 19:00 va al 25 %',
  motivo: 'Cuatro semanas seguidas por debajo de la mitad del aforo.',
  impacto: { valor: 12, unidad: 'PCT_OCUPACION', formula: '' },
  prioridad: 'BAJA',
});

const ESPECIALISTAS_MVP = ['RETENCION', 'INGRESOS', 'AGENDA', 'CAPTACION', 'FINANZAS', 'MARKETING', 'EQUIPO', 'ONBOARDING'];

const DECISIONES = {
  resumen: {
    id: 'rd-1', studioId: STUDIO_ID, fecha: fecha(dia(0)),
    ingresosMes: 4820, sociasActivas: 3, altasMes: 1, bajasMes: 0,
    ocupacionMedia: 0.72, clasesSemana: 7, creadoEn: iso(dia(0), 6, 0),
  },
  // `tipo: 'MENSAJE'` + `recomendacion` = hay veredicto del día (el Umbral).
  veredicto: {
    tipo: 'MENSAJE',
    recomendacion: REC_ABRIR,
    fraseConfianza: 'Con 5 semanas de datos, esto es bastante seguro.',
    semanaTranquila: false,
  },
  seguimiento: [
    { outcome: 'POSITIVO', tipo: 'ABRIR_CLASE', titulo: 'La clase que abriste hace tres semanas va al 83 %', socioId: null, medidoEn: iso(dia(-2), 6, 0) },
  ],
  prioridades: [REC_ABRIR, REC_RECUPERAR],
  masSituaciones: [REC_HORARIO],
  porEspecialista: ESPECIALISTAS_MVP.map((especialista) => {
    const recs = [REC_ABRIR, REC_RECUPERAR, REC_HORARIO].filter((r) => r.especialista === especialista);
    return {
      especialista,
      pendientes: recs.length,
      impactoTotal: recs.length ? { valor: recs.length * 40, unidad: 'EUR_MES', formula: '' } : null,
      estado: recs.length ? 'ATENCION' : 'EN_ORDEN',
    };
  }),
  actividad: [
    { id: 'act-1', studioId: STUDIO_ID, tipo: 'RESERVA', texto: 'María García reservó Reformer de mañana', socioId: 'soc-1', enlace: null, creadoEn: iso(dia(0), 9, 30), actorNombre: 'María García' },
    { id: 'act-2', studioId: STUDIO_ID, tipo: 'COBRO', texto: 'Cobrado el bono de Carmen Del Río · 130 €', socioId: 'soc-3', enlace: null, creadoEn: iso(dia(0), 8, 15), actorNombre: 'Cloe' },
  ],
  nAutonomasHoy: 2,
};

const mapSesionCal = (s: typeof SESIONES[number]) => ({
  id: s.id, studioId: s.studio_id, tipoClaseId: s.tipo_clase_id, salaId: s.sala_id,
  instructorId: s.instructor_id, inicio: s.inicio, fin: s.fin,
  aforoMaximo: s.aforo_maximo, cancelada: s.cancelada, notas: s.notas,
  precioPuntual: s.precio_puntual, serieId: s.serie_id,
});

/** Fila cruda de `reservas` → lo que devuelve `/api/calendario` (camelCase). */
const mapReservaCal = (r: typeof RESERVAS[number]) => ({
  id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id,
  estado: r.estado, spotId: r.spot_id, posicionEspera: r.posicion_espera,
  ofertaExpiraEn: r.oferta_expira_en, checkInEn: r.check_in_en, creadoEn: r.creado_en,
  confirmacionPedidaEn: r.confirmacion_pedida_en, confirmadoEn: r.confirmado_en,
  recordatorioConfirmacionEn: r.recordatorio_confirmacion_en,
  valoracionExperiencia: r.valoracion_experiencia, canceladaTardia: r.cancelada_tardia,
});

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

/** Lo que el andamiaje no cubre, para que se pueda exigir o al menos mirar. */
export interface CoberturaPanel {
  /** Endpoints `/api/` que la pantalla pidió y NADIE sembró: contestados `{}`. */
  sinSembrar: () => string[];
}

export async function montar(page: Page): Promise<CoberturaPanel> {
  const sinSembrar: string[] = [];

  // ⚠️ Comodines PRIMERO: Playwright prioriza la ruta registrada más tarde.
  await page.route('**/rest/v1/**', (r) => json(r, []));

  // ⚠️ Este catch-all contesta **`{}` con éxito** a todo lo que no esté sembrado
  // abajo, y eso NO es inocuo. El panel llama a unos 200 endpoints y aquí se
  // nombran cinco: el resto recibe un objeto vacío, la pantalla pinta su estado
  // vacío y el test pasa sin haber visto nada. Medido: `centro-de-control`
  // renderiza **360 caracteres**, `mensajeria` 395, `productos` 460. Las que sí
  // salen pobladas (`cierre`, `informes`) es porque sus datos vienen de
  // `rest/v1`, que sí está sembrado.
  //
  // Ya costó un susto: «Un `[...data.prioridades]` a secas con un `{}` por
  // respuesta no rompe su tarjeta: rompe la pantalla principal del negocio. Lo
  // destapó un e2e ajeno que mockea `/api/**` como `{}`» — o sea, este.
  //
  // No se cambia el comportamiento (sembrar los 195 es otro trabajo), pero se
  // le da VOZ: `sinSembrar()` dice a qué se contestó en falso, para que una
  // suite pueda exigirlo, medir su cobertura, o al menos que quien lea el fallo
  // sepa que la pantalla estaba vacía por el andamiaje y no por el código.
  await page.route('**/api/**', (r) => {
    sinSembrar.push(new URL(r.request().url()).pathname);
    return json(r, {});
  });

  // ── Los 13 que las pantallas piden de verdad ──
  // Los dos primeros los pide la CABECERA, así que salen en las 21 pantallas.
  await page.route((u) => u.pathname === '/api/notifications', (r) => json(r, {
    items: AVISOS_PANEL, unread: AVISOS_PANEL.filter((a) => !a.readAt).length,
  }));
  await page.route((u) => u.pathname === '/api/mensajeria/conversaciones', (r) => json(r, { conversaciones: CONVERSACIONES_PANEL }));

  await page.route((u) => u.pathname === '/api/decisiones', (r) => json(r, DECISIONES));
  await page.route((u) => u.pathname === '/api/decisiones/autonomia', (r) => json(r, {
    activa: false, cupoDiario: 3, usadasHoy: 2, tipos: [],
  }));
  await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, {
    sesiones: SESIONES.map(mapSesionCal), reservas: RESERVAS.map(mapReservaCal), sustituciones: [],
    salas: SALAS.map((s) => ({ id: s.id, studioId: STUDIO_ID, nombre: s.nombre, capacidad: s.capacidad })),
    instructores: EQUIPO.map((e) => ({ id: e.id, studioId: STUDIO_ID, nombre: e.nombre, rol: e.rol, color: e.color, activo: e.activo })),
    horaApertura: '07:00', horaCierre: '21:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));

  await page.route((u) => u.pathname === '/api/equipo/ausencias', (r) => json(r, { ausencias: [] }));
  await page.route((u) => u.pathname === '/api/equipo/tarifas', (r) => json(r, {
    tarifas: [{ instructorId: 'ins-marta', importeHora: 22, moneda: 'EUR' }],
  }));
  await page.route((u) => u.pathname === '/api/equipo/tarjetas', (r) => json(r, { tarjetas: [] }));
  await page.route((u) => u.pathname === '/api/ingresos-manuales', (r) => json(r, { ingresos: [] }));
  await page.route((u) => u.pathname === '/api/comunidad/comentarios', (r) => json(r, { comentarios: [] }));
  await page.route((u) => u.pathname === '/api/notifications/admin', (r) => json(r, { items: [], unread: 0 }));
  await page.route((u) => u.pathname === '/api/sustituciones', (r) => json(r, { sustituciones: [] }));
  await page.route((u) => u.pathname === '/api/valoraciones', (r) => json(r, { valoraciones: [] }));
  await page.route((u) => u.pathname === '/api/migracion/recientes', (r) => json(r, { importaciones: [] }));

  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/api/billing/status**', (r) => json(r, { activa: true, plan: 'ESTUDIO', features: {} }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));

  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (r) => json(r, STUDIO_ROW));
  await page.route('**/rest/v1/instructores**', (r) => json(r, EQUIPO));
  await page.route('**/rest/v1/socios**', (r) => json(r, SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', (r) => json(r, PLANES));
  await page.route('**/rest/v1/suscripciones**', (r) => json(r, SUSCRIPCIONES));
  await page.route('**/rest/v1/salas**', (r) => json(r, SALAS));
  await page.route('**/rest/v1/tipos_clase**', (r) => json(r, TIPOS));
  await page.route('**/rest/v1/sesiones**', (r) => json(r, SESIONES));
  await page.route('**/rest/v1/reservas**', (r) => json(r, RESERVAS));
  await page.route('**/rest/v1/recibos**', (r) => json(r, RECIBOS));
  await page.route('**/rest/v1/facturas**', (r) => json(r, FACTURAS));
  await page.route('**/rest/v1/productos_pos**', (r) => json(r, PRODUCTOS));

  await page.addInitScript(([k, id]) => {
    localStorage.setItem(k, JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
      user: { id, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, UID] as const);

  return { sinSembrar: () => [...new Set(sinSembrar)] };
}


/**
 * Navegar entre pantallas del panel aborta la carga: el App Router redirige
 * durante la hidratación y Playwright lo ve como `net::ERR_ABORTED`. No es un
 * fallo — la pantalla acaba pintándose igual —, así que se tolera y se espera
 * al contenido.
 *
 * Sin `networkidle`: con todo mockeado la red nunca queda del todo quieta.
 */
export async function ir(page: Page, ruta: string) {
  await page.goto(`/${ruta}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  // ⚠️ Un `waitForTimeout` a secas no vale: bajo carga (varios workers contra un
  // solo `next dev`) la pantalla se queda en su esqueleto y lo que se mide es
  // el esqueleto — capturas grises, y un barrido que no encuentra nada porque
  // no había nada que encontrar.
  //
  // Se espera a DOS cosas, y en este orden:
  //   1. que el panel haya montado — `#panel-portal-host`, el anfitrión de sus
  //      portales, que `DashboardShell` pinta en TODAS sus pantallas y que el
  //      404 (que vive en la raíz, fuera de ese layout) no tiene;
  //   2. que no quede ningún esqueleto de datos.
  //
  // ⚠️ El presupuesto del segundo es corto A PROPÓSITO. Esperarlo 25 s se comía
  // casi entero el límite de 30 s por test de Playwright, y cuando expiraba el
  // test moría sin haber medido nada — el remedio salía más caro que la
  // enfermedad. Aquí una espera agotada no es un fallo: es «sigue adelante y
  // mide lo que haya», y el guardia del propio test decide si sirve.
  // ⚠️ `state: 'attached'`. Es un <div> VACÍO, así que nunca llega a ser
  // «visible» —mide 0×0— y con el estado por defecto esta espera se agotaba
  // entera sin cumplirse nunca: 20 s por pantalla tirados, en cada corrida.
  // Lo tapaba el `.catch()`, y el guardia del test seguía funcionando porque
  // `querySelector` no mira el tamaño. Una espera que nunca acierta no falla:
  // solo cuesta.
  await page.waitForSelector('#panel-portal-host', { state: 'attached', timeout: 20_000 }).catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 5_000 })
    .catch(() => {});
  // ⚠️ Y a que termine la animación de ENTRADA de la pantalla. `.panel-page-in`
  // hace un fundido de opacidad, y medir a mitad devuelve colores que no son de
  // nadie: mezclas del texto con el fondo. Costó 18 «fallos» de contraste
  // fantasma en una corrida de CI, todos de una pantalla que además solo
  // redirigía —dos transiciones encadenadas—. Se mira solo esa animación y no
  // `getAnimations()` entero, que en una pantalla con un spinner no termina
  // nunca.
  await page
    .waitForFunction(
      () => Array.from(document.querySelectorAll('.panel-page-in'))
        .flatMap((el) => el.getAnimations())
        .every((a) => a.playState === 'finished' || a.playState === 'idle'),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(600);
}

/** Arranca el panel en modo oscuro (preferencia por usuario, localStorage). */
export async function enOscuro(page: Page) {
  await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
}
