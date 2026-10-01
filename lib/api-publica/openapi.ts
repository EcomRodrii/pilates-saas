// Especificación OpenAPI 3.1 de la API pública v1. Se sirve en
// GET /api/v1/openapi.json y la lee cualquier generador de clientes o Swagger UI.
//
// Escrita a mano y explícita a propósito. Lo que impide que mienta es
// `openapi.test.ts`: cada esquema tiene que tener EXACTAMENTE las propiedades
// que devuelve su serializador (lib/api-publica/serializar.ts), y cada ruta de
// app/api/v1 tiene que estar aquí (y al revés).

import { DESCRIPCION_SCOPE, SCOPES_VALIDOS } from './catalogo-scopes.ts';
import { SCOPE_DE_RECURSO, TIPOS_EVENTO } from './webhooks/catalogo.ts';

type Esquema = Record<string, unknown>;
const str = (description?: string, extra: Esquema = {}): Esquema => ({ type: ['string', 'null'], ...(description ? { description } : {}), ...extra });
const strReq = (description?: string): Esquema => ({ type: 'string', ...(description ? { description } : {}) });
const int = (description?: string): Esquema => ({ type: ['integer', 'null'], ...(description ? { description } : {}) });
const cent = (description: string): Esquema => ({ type: ['integer', 'null'], description: `${description} En céntimos.` });
const bool = (description?: string): Esquema => ({ type: 'boolean', ...(description ? { description } : {}) });
const fecha = (description: string): Esquema => str(description, { format: 'date' });
const instante = (description: string): Esquema => str(description, { format: 'date-time' });
const moneda: Esquema = { type: 'string', enum: ['EUR'], description: 'Hoy siempre EUR.' };
const obj = (properties: Record<string, Esquema>, description?: string): Esquema => ({
  type: 'object', ...(description ? { description } : {}), properties, required: Object.keys(properties),
});

export const ESQUEMAS: Record<string, Esquema> = {
  Error: obj({
    error: strReq('Código estable: invalid_token, insufficient_scope, invalid_request, not_found, rate_limited, api_no_activada, estudio_sin_acceso, idempotency_conflict, request_in_progress, server_error.'),
    mensaje: strReq('Explicación legible.'),
    requestId: strReq('Cítalo si escribes a soporte.'),
  }),
  Sede: obj({ id: strReq('Lo que va en la cabecera Tentare-Estudio.'), nombre: str() }),
  Estudio: obj({
    id: strReq(), nombre: str(), razonSocial: str(), nif: str(), direccion: str(),
    zonaHoraria: strReq('Zona horaria de las fechas del estudio, p. ej. Europe/Madrid.'), moneda,
    ivaPorDefecto: { type: ['number', 'null'], description: 'Tipo de IVA (%) que aplica el estudio por defecto.' },
    modoFacturacion: str('`verifactu`: Tentare emite las facturas. `sin_facturas`: no las emite; la contabilidad sale de /recibos.'),
  }),
  Clienta: obj({
    id: strReq(), nombre: str(), apellidos: str(), email: str(), telefono: str(),
    activa: bool(), fechaAlta: instante('Alta en Tentare.'),
    activo: bool('Igual que `activa` (nombre de la v1 original).'), creadoEn: instante('Igual que `fechaAlta` (nombre de la v1 original).'),
    nif: str('Solo con el permiso clientas:datos_fiscales.'), direccion: str('Solo con el permiso clientas:datos_fiscales.'),
  }),
  Recibo: obj({
    id: strReq(), clientaId: str('null en ventas de mostrador sin clienta.'), suscripcionId: str(), concepto: str(), moneda,
    importe: cent('Importe del recibo, IVA incluido.'), importeDevuelto: cent('Acumulado reembolsado.'),
    importeIngresado: cent('Lo que de verdad entró: importe − devuelto si está cobrado; 0 si no.'),
    estado: str('PENDIENTE, EN_CURSO, COBRADO, FALLIDO, DEVUELTO o ANULADO.'),
    situacion: { type: 'string', enum: ['COBRADO', 'POR_COBRAR', 'IMPAGADO', 'EN_CURSO', 'REEMBOLSADO', 'ANULADO'], description: 'Lectura del estado para contabilidad. DEVUELTO es IMPAGADO si lo devolvió el banco y REEMBOLSADO si lo devolvió el estudio.' },
    fechaVencimiento: fecha('Vencimiento.'), fechaCobro: fecha('Día del cobro (día del estudio).'), fechaDevolucion: fecha('Día de la devolución.'),
    metodoCobro: str('TARJETA, SEPA, BIZUM, EFECTIVO o TRANSFERENCIA; null si no consta.'),
    esRenovacion: bool(), stripePaymentIntentId: str('Para cruzarlo con Stripe.'), anuladoEn: instante('Si se anuló.'),
  }),
  Factura: obj({
    id: strReq(), numero: str('Número completo.'), serie: str(), tipo: str('F1, F2 o rectificativas R1–R5.'),
    tipoRectificativa: str('S (sustitución) o I (diferencias).'), rectificaA: str('Factura que rectifica.'),
    fechaEmision: fecha('Fecha de emisión.'),
    receptor: obj({ nombre: str(), nif: str() }), concepto: str(), moneda,
    baseImponible: cent('Base imponible.'), tipoIva: { type: ['number', 'null'], description: 'Tipo de IVA (%).' },
    cuotaIva: cent('Cuota de IVA.'), total: cent('Total.'), importeRectificacion: cent('Importe rectificado.'),
    reciboId: str(), ventaId: str(),
    verifactu: obj({ estado: str('Estado del registro en la AEAT.'), csv: str('Acuse de la AEAT.'), urlCotejo: str('URL del QR de cotejo.') }),
  }),
  LineaVenta: obj({
    id: str(), tipo: str('PRODUCTO, PLAN…'), nombre: str(), cantidad: int(), precioUnitario: cent('Precio unitario.'),
    descuento: cent('Descuento.'), tipoIva: { type: ['number', 'null'] }, baseImponible: cent('Base.'),
    cuotaIva: cent('Cuota de IVA.'), total: cent('Total de la línea.'), cantidadDevuelta: { type: 'integer' },
  }),
  Venta: obj({
    id: strReq(), numero: int(), clientaId: str(), reciboId: str('El recibo que la cuenta como ingreso. null en ventas antiguas sin recibo.'),
    fecha: instante('Momento de la venta.'), estado: str('PENDIENTE_PAGO, PAGADA o ANULADA.'), metodoPago: str(), moneda,
    subtotal: cent('Subtotal.'), descuento: cent('Descuento.'), baseImponible: cent('Base.'), ivaTotal: cent('IVA.'),
    total: cent('Total.'), importeDevuelto: cent('Devuelto.'), devueltaEn: instante('Devuelta entera.'), anuladaEn: instante('Anulada.'),
    lineas: { type: 'array', items: { $ref: '#/components/schemas/LineaVenta' } },
  }),
  Devolucion: obj({
    id: strReq(), reciboId: str(), ventaId: str(), clientaId: str(),
    origen: str('REEMBOLSO_TOTAL, REEMBOLSO_PARCIAL o CHARGEBACK.'), moneda,
    importeCobrado: cent('Lo cobrado en origen.'), importeDevuelto: cent('Acumulado devuelto.'),
    estado: str(), stripeChargeId: str(), detectadaEn: instante('Cuándo se detectó.'), resueltaEn: instante('Cuándo se resolvió.'),
  }),
  Suscripcion: obj({
    id: strReq(), clientaId: str(), planId: str(), planNombre: str(), tipoPlan: str('MENSUAL, BONO o PUNTUAL.'),
    estado: str('ACTIVA, PAUSADA, CANCELADA o EXPIRADA.'), fechaInicio: fecha('Inicio.'), fechaFin: fecha('Fin.'),
    sesionesRestantes: int('Solo en bonos.'), bajaAlVencer: bool(),
  }),
  Tarifa: obj({
    id: strReq(), nombre: str(), descripcion: str(), tipo: str('MENSUAL, BONO o PUNTUAL.'), moneda,
    precio: cent('Precio.'), sesiones: int(), validezDias: int(), periodicidadMeses: int(),
    matricula: cent('Matrícula.'), activa: bool(),
  }),
  Reserva: obj({
    id: strReq(), sesionId: str(), socioId: str('La clienta (nombre original de la v1). null en reservas de ClassPass/USC.'),
    clientaId: str('Igual que `socioId`, con el nombre del resto de la API.'),
    estado: str('CONFIRMADA, LISTA_ESPERA, PENDIENTE_APROBACION, CANCELADA, ASISTIDA o NO_ASISTIO.'),
    spotId: str('Máquina o sitio, si la clase los numera.'), creadoEn: instante('Cuándo se reservó.'),
    checkInEn: instante('Cuándo entró a la clase.'),
    origen: str('TENTARE, o la plataforma por la que llegó (CLASSPASS, URBAN_SPORTS_CLUB…).'),
    canceladaTardia: bool('Se canceló fuera de plazo.'),
    clase: { type: ['object', 'null'], properties: { inicio: instante('Inicio.'), fin: instante('Fin.'), nombre: str('Tipo de clase.') }, required: ['inicio', 'fin', 'nombre'] },
  }),
  Evento: obj({
    id: strReq('Único: úsalo para no procesar dos veces el mismo evento.'),
    tipo: { type: 'string', enum: [...TIPOS_EVENTO], description: '`<recurso>.<creado|actualizado|eliminado>` (en femenino para factura, devolución, venta y clienta).' },
    creadoEn: strReq('Cuándo ocurrió.'), estudioId: strReq(),
    recurso: { type: 'string', enum: Object.keys(SCOPE_DE_RECURSO) }, recursoId: strReq('Id del recibo, factura, devolución, venta o clienta.'),
    version: { type: 'string', enum: ['v1'] },
    datos: { type: ['object', 'null'], description: 'El recurso con la misma forma que su endpoint (Recibo, Factura, Devolucion, Venta, Clienta sin datos fiscales, Reserva o Suscripcion), tal y como estaba segundos después del cambio. null si ya no existe.' },
  }),
};

const PARAMS_LISTADO = [
  { name: 'desde', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Primer día (incluido), día del estudio.' },
  { name: 'hasta', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Último día (incluido).' },
  { name: 'orden', in: 'query', schema: { type: 'string', enum: ['desc', 'asc'], default: 'desc' } },
  { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'El de la cabecera X-Siguiente-Cursor de la página anterior.' },
];
const CABECERAS_PAGINA = {
  'X-Hay-Mas': { schema: { type: 'string', enum: ['true', 'false'] } },
  'X-Siguiente-Cursor': { schema: { type: 'string' }, description: 'Solo si X-Hay-Mas es true.' },
  'X-Request-Id': { schema: { type: 'string' } },
};
/** En los POST: reintentar con la misma clave no vuelve a crear nada (lib/api-publica/idempotencia.ts). */
const IDEMPOTENCIA = {
  name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 1, maxLength: 255 },
  description: 'Opcional y recomendada. Un valor único por operación (p. ej. un UUID). Si reintentas con la misma clave y la misma petición, '
    + 'recibes la respuesta del primer intento (cabecera Idempotent-Replayed: true) y no se crea nada dos veces. Se guarda 24 h.',
};
const ERRORES_IDEMPOTENCIA = {
  409: { description: 'Otra petición con la misma Idempotency-Key sigue en marcha (mira Retry-After)' },
  422: { description: 'Esa Idempotency-Key ya se usó con otra petición' },
};
const ERRORES = Object.fromEntries(
  ([['400', 'Petición no válida'], ['401', 'Credencial no válida'], ['403', 'Sin permiso, API no activada o estudio sin acceso'], ['429', 'Demasiadas peticiones (mira Retry-After)']] as const)
    .map(([c, d]) => [c, { description: d, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }]),
);

function lista(resumen: string, scope: string, esquema: string, extra: unknown[] = [], descripcion?: string) {
  return {
    get: {
      summary: resumen, ...(descripcion ? { description: descripcion } : {}), security: [{ bearer: [] }], 'x-scope': scope,
      parameters: [...PARAMS_LISTADO, ...extra],
      responses: {
        200: { description: 'Una página', headers: CABECERAS_PAGINA, content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${esquema}` } } } } },
        ...ERRORES,
      },
    },
  };
}
function uno(resumen: string, scope: string | null, esquema: string, conId = true) {
  return {
    get: {
      summary: resumen, security: [{ bearer: [] }], ...(scope ? { 'x-scope': scope } : {}),
      parameters: conId ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] : [],
      responses: {
        200: { description: 'OK', content: { 'application/json': { schema: { $ref: `#/components/schemas/${esquema}` } } } },
        404: { description: 'No existe en este estudio', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ...ERRORES,
      },
    },
  };
}
const q = (name: string, description: string, schema: Esquema = { type: 'string' }) => ({ name, in: 'query', schema, description });

/** Rutas documentadas (sin el prefijo /api/v1). `openapi.test.ts` las cruza con app/api/v1. */
export const RUTAS: Record<string, unknown> = {
  '/estudio': uno('El estudio de la petición', null, 'Estudio', false),
  '/estudios': {
    get: {
      summary: 'Las sedes a las que llega la credencial',
      description: 'Con una clave de sede o un token OAuth, solo la suya. Con una clave de cadena, las sedes de la cadena a las que llega ahora '
        + '(API activada y estudio con acceso): pide cada una con la cabecera Tentare-Estudio. La única ruta que una clave de cadena puede llamar sin esa cabecera.',
      security: [{ bearer: [] }],
      responses: {
        200: { description: 'Todas (sin paginar)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Sede' } } } } },
        ...ERRORES,
      },
    },
  },
  '/clientas': {
    ...lista('Clientas', 'clientas:leer', 'Clienta', [], 'Con clientas:datos_fiscales incluye NIF y dirección.'),
    post: { summary: 'Crear una clienta', security: [{ bearer: [] }], 'x-scope': 'clientas:escribir', parameters: [IDEMPOTENCIA], responses: { 201: { description: 'Creada' }, ...ERRORES_IDEMPOTENCIA, 409: { description: 'Ya existe una clienta con ese email, u otra petición con la misma Idempotency-Key sigue en marcha' }, ...ERRORES } },
  },
  '/recibos': lista('Recibos (cobros)', 'pagos:leer', 'Recibo', [
    q('fecha', '`cobro` lista por fecha de cobro (solo lo cobrado); `vencimiento` (por defecto) lista todo.', { type: 'string', enum: ['vencimiento', 'cobro'] }),
    q('estado', 'Filtra por estado.'), q('clientaId', 'Filtra por clienta.'),
  ], 'Para contabilizar ingresos usa `importeIngresado` con `fecha=cobro`.'),
  '/recibos/{id}': uno('Un recibo', 'pagos:leer', 'Recibo'),
  '/facturas': lista('Facturas emitidas', 'facturas:leer', 'Factura', [q('tipo', 'F1, F2, R1…R5.')]),
  '/facturas/{id}': uno('Una factura', 'facturas:leer', 'Factura'),
  '/ventas': lista('Ventas de la caja', 'pagos:leer', 'Venta', [q('estado', 'PENDIENTE_PAGO, PAGADA o ANULADA.')],
    'Cada venta pagada tiene su recibo en /recibos: no sumes las dos cosas.'),
  '/devoluciones': lista('Reembolsos y contracargos', 'pagos:leer', 'Devolucion'),
  '/suscripciones': lista('Cuotas y bonos', 'planes:leer', 'Suscripcion', [q('estado', 'ACTIVA, PAUSADA, CANCELADA o EXPIRADA.'), q('clientaId', 'Filtra por clienta.')]),
  '/tarifas': { get: { summary: 'Catálogo de planes y bonos', security: [{ bearer: [] }], 'x-scope': 'planes:leer', parameters: [q('activas', 'true: solo las que se venden.')], responses: { 200: { description: 'Todas (sin paginar)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Tarifa' } } } } }, ...ERRORES } } },
  '/planes': { get: { summary: 'Obsoleto: usa /suscripciones', deprecated: true, security: [{ bearer: [] }], 'x-scope': 'planes:leer', responses: { 200: { description: 'Suscripciones (forma antigua)' }, ...ERRORES } } },
  '/reservas': {
    get: { summary: 'Reservas', security: [{ bearer: [] }], 'x-scope': 'reservas:leer', parameters: [q('estado', 'CONFIRMADA por defecto.'), q('socioId', 'Filtra por clienta.'), { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }], responses: { 200: { description: 'Las más recientes primero (sin paginar: es la forma con la que nació para Zapier). Solo reservas de clientas de Tentare.', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Reserva' } } } } }, ...ERRORES } },
    post: { summary: 'Crear una reserva', security: [{ bearer: [] }], 'x-scope': 'reservas:escribir', parameters: [IDEMPOTENCIA], responses: { 201: { description: 'Creada' }, ...ERRORES_IDEMPOTENCIA, ...ERRORES } },
  },
  '/reservas/cancelar': { post: { summary: 'Cancelar una reserva', security: [{ bearer: [] }], 'x-scope': 'reservas:escribir', parameters: [IDEMPOTENCIA], responses: { 200: { description: 'Cancelada' }, ...ERRORES_IDEMPOTENCIA, ...ERRORES } } },
  '/notas': { post: { summary: 'Crear una nota operativa', security: [{ bearer: [] }], 'x-scope': 'notas:escribir', parameters: [IDEMPOTENCIA], responses: { 201: { description: 'Creada' }, ...ERRORES_IDEMPOTENCIA, ...ERRORES } } },
  '/tareas': { post: { summary: 'Crear una tarea', security: [{ bearer: [] }], 'x-scope': 'tareas:escribir', parameters: [IDEMPOTENCIA], responses: { 201: { description: 'Creada' }, ...ERRORES_IDEMPOTENCIA, ...ERRORES } } },
  '/eventos': {
    get: {
      summary: 'Registro de eventos (lo que ha cambiado)',
      description: 'Los mismos eventos que mandan los webhooks, de más antiguo a más nuevo (se guardan 30 días). '
        + 'Guarda X-Siguiente-Cursor —viene también cuando ya no hay más— y vuelve a preguntar con él. '
        + 'Cada tipo exige el permiso de su recurso (recibo, venta y devolución: pagos:leer; factura: facturas:leer; clienta: clientas:leer).',
      security: [{ bearer: [] }],
      parameters: [
        q('cursor', 'El de la cabecera X-Siguiente-Cursor de la respuesta anterior. Sin él, desde el principio.'),
        q('tipos', 'Lista separada por comas, p. ej. recibo.creado,recibo.actualizado.'),
        { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 100 } },
      ],
      responses: {
        200: {
          description: 'Una página, en orden de llegada',
          headers: { ...CABECERAS_PAGINA, 'X-Siguiente-Cursor': { schema: { type: 'string' }, description: 'Desde dónde seguir. Guárdalo aunque X-Hay-Mas sea false.' } },
          content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Evento' } } } },
        },
        ...ERRORES,
      },
    },
  },
};

/** En todas menos /estudios: a qué sede va la petición (lib/api-publica/cadena.ts). */
const ESTUDIO = {
  name: 'Tentare-Estudio', in: 'header', required: false, schema: { type: 'string', maxLength: 100 },
  description: 'Obligatoria con una clave de cadena: el id de la sede (GET /estudios). Con otra credencial sobra; si va, tiene que ser su sede. '
    + 'Si la credencial no llega a esa sede: 404.',
};
for (const [ruta, operaciones] of Object.entries(RUTAS as Record<string, Record<string, { parameters?: unknown[] }>>)) {
  if (ruta === '/estudios') continue;
  for (const op of Object.values(operaciones)) op.parameters = [...(op.parameters ?? []), ESTUDIO];
}

/** Los webhooks (OpenAPI 3.1): lo que Tentare manda a la URL del estudio. */
export const WEBHOOKS: Record<string, unknown> = Object.fromEntries(TIPOS_EVENTO.map((tipo) => [tipo, {
  post: {
    summary: `Aviso «${tipo}»`,
    description: 'POST firmado. Comprueba la cabecera Tentare-Firma (t=<segundos>,v1=<HMAC-SHA256 en hex de "<t>.<cuerpo>" con tu secreto whsec_…>) '
      + 'y rechaza un t de hace más de 5 minutos. Contesta 2xx en menos de 8 segundos; cualquier otra cosa se reintenta durante casi 3 días. '
      + 'Puede llegar más de una vez y desordenado: usa el id del evento.',
    parameters: [
      { name: 'Tentare-Firma', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'Tentare-Evento-Id', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'Tentare-Evento-Tipo', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'Tentare-Entrega-Id', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'Tentare-Intento', in: 'header', required: true, schema: { type: 'string' } },
    ],
    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Evento' } } } },
    responses: { 200: { description: 'Recibido (cualquier 2xx vale)' } },
  },
}]));

// `nif` y `direccion` solo salen con clientas:datos_fiscales: no son obligatorias.
ESQUEMAS.Clienta.required = (ESQUEMAS.Clienta.required as string[]).filter(k => k !== 'nif' && k !== 'direccion');

export function documentoOpenApi(servidor: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'API de Tentare',
      version: '1',
      description: 'API pública v1. Autenticación con `Authorization: Bearer <clave de API del estudio o token OAuth>`. '
        + 'Una clave de cadena llega a todas sus sedes: cada petición lleva la cabecera `Tentare-Estudio` con la sede (GET /estudios las lista). '
        + 'Importes en céntimos, fechas del estudio en AAAA-MM-DD. Guía completa: docs/api-publica.md.\n\n'
        + 'Permisos (scopes):\n' + SCOPES_VALIDOS.map(s => `- \`${s}\`: ${DESCRIPCION_SCOPE[s]}`).join('\n'),
    },
    servers: [{ url: `${servidor}/api/v1` }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Clave de API (tnt_sk_…, de una sede o de toda la cadena) o token de acceso OAuth.' } },
      schemas: ESQUEMAS,
    },
    paths: RUTAS,
    webhooks: WEBHOOKS,
  };
}
