// Especificación OpenAPI 3.1 de la API pública v1. Se sirve en
// GET /api/v1/openapi.json y la lee cualquier generador de clientes o Swagger UI.
//
// Escrita a mano y explícita a propósito. Lo que impide que mienta es
// `openapi.test.ts`: cada esquema tiene que tener EXACTAMENTE las propiedades
// que devuelve su serializador (lib/api-publica/serializar.ts), y cada ruta de
// app/api/v1 tiene que estar aquí (y al revés).

import { DESCRIPCION_SCOPE, SCOPES_VALIDOS } from './catalogo-scopes.ts';

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
    error: strReq('Código estable: invalid_token, insufficient_scope, invalid_request, not_found, rate_limited, api_no_activada, estudio_sin_acceso, server_error.'),
    mensaje: strReq('Explicación legible.'),
    requestId: strReq('Cítalo si escribes a soporte.'),
  }),
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
  '/estudio': uno('El estudio de la credencial', null, 'Estudio', false),
  '/clientas': {
    ...lista('Clientas', 'clientas:leer', 'Clienta', [], 'Con clientas:datos_fiscales incluye NIF y dirección.'),
    post: { summary: 'Crear una clienta', security: [{ bearer: [] }], 'x-scope': 'clientas:escribir', responses: { 201: { description: 'Creada' }, 409: { description: 'Ya existe una clienta con ese email' }, ...ERRORES } },
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
    get: { summary: 'Reservas', security: [{ bearer: [] }], 'x-scope': 'reservas:leer', parameters: [...PARAMS_LISTADO, q('estado', 'CONFIRMADA por defecto.'), q('socioId', 'Filtra por clienta.')], responses: { 200: { description: 'Una página', headers: CABECERAS_PAGINA }, ...ERRORES } },
    post: { summary: 'Crear una reserva', security: [{ bearer: [] }], 'x-scope': 'reservas:escribir', responses: { 201: { description: 'Creada' }, ...ERRORES } },
  },
  '/reservas/cancelar': { post: { summary: 'Cancelar una reserva', security: [{ bearer: [] }], 'x-scope': 'reservas:escribir', responses: { 200: { description: 'Cancelada' }, ...ERRORES } } },
  '/notas': { post: { summary: 'Crear una nota operativa', security: [{ bearer: [] }], 'x-scope': 'notas:escribir', responses: { 201: { description: 'Creada' }, ...ERRORES } } },
  '/tareas': { post: { summary: 'Crear una tarea', security: [{ bearer: [] }], 'x-scope': 'tareas:escribir', responses: { 201: { description: 'Creada' }, ...ERRORES } } },
};

// `nif` y `direccion` solo salen con clientas:datos_fiscales: no son obligatorias.
ESQUEMAS.Clienta.required = (ESQUEMAS.Clienta.required as string[]).filter(k => k !== 'nif' && k !== 'direccion');

export function documentoOpenApi(servidor: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'API de Tentare',
      version: '1',
      description: 'API pública v1. Autenticación con `Authorization: Bearer <clave de API del estudio o token OAuth>`. '
        + 'Importes en céntimos, fechas del estudio en AAAA-MM-DD. Guía completa: docs/api-publica.md.\n\n'
        + 'Permisos (scopes):\n' + SCOPES_VALIDOS.map(s => `- \`${s}\`: ${DESCRIPCION_SCOPE[s]}`).join('\n'),
    },
    servers: [{ url: `${servidor}/api/v1` }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'Clave de API (tnt_sk_…) o token de acceso OAuth.' } },
      schemas: ESQUEMAS,
    },
    paths: RUTAS,
  };
}
