// La forma PÚBLICA de cada recurso de la API v1: qué columnas se leen y qué se
// devuelve. Lista blanca en los dos sentidos, y en el mismo fichero para que no
// se separen: una columna que no está en `COLUMNAS` no se lee, y una que se lee
// no sale si el serializador no la nombra. Nunca `select('*')` hacia fuera:
// las tablas tienen columnas internas (hashes de términos, ids de sesiones de
// Stripe, metadatos de entrega) que no son de nadie más.
//
// Convenciones (docs/api-publica.md):
//   · nombres en español, camelCase, igual que la v1 que ya usaba Zapier;
//   · importes en CÉNTIMOS enteros, siempre con `moneda` (hoy siempre EUR: no
//     hay columna de moneda, es una constante del sistema);
//   · fechas: 'YYYY-MM-DD' para las columnas `date`, ISO 8601 para instantes;
//   · `null` cuando el dato no existe; nunca un 0 o un '' inventados.

import { importeIngresado, situacionRecibo, type SituacionRecibo } from '../billing/situacion-recibo.ts';

export const MONEDA = 'EUR';

/** Euros (numeric de Postgres, puede llegar como texto) → céntimos enteros. */
export function aCentimos(x: number | string | null | undefined): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'string' ? Number(x) : x;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
const centimos0 = (x: number | string | null | undefined) => aCentimos(x) ?? 0;
const num = (x: number | string | null | undefined): number | null => {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'string' ? Number(x) : x;
  return Number.isFinite(n) ? n : null;
};

export const COLUMNAS = {
  estudio: 'id, nombre, razon_social, nif, direccion, zona_horaria, iva_por_defecto, modo_facturacion',
  clienta: 'id, nombre, apellidos, email, telefono, activo, fecha_alta',
  clientaFiscal: 'id, nombre, apellidos, email, telefono, activo, fecha_alta, nif, direccion',
  recibo: 'id, socio_id, suscripcion_id, concepto, importe, importe_devuelto, estado, fecha_vencimiento, fecha_cobro, fecha_devolucion, metodo_cobro, es_renovacion, stripe_payment_intent_id, anulado_en, reembolso_stripe_id, reembolso_solicitado_en',
  factura: 'id, recibo_id, venta_pos_id, numero_completo, serie, tipo, tipo_rectificativa, rectifica_a, importe_rectificacion, fecha_emision, receptor_nombre, receptor_nif, concepto, base_imponible, tipo_iva, cuota_iva, total, verifactu_estado, verifactu_csv, verifactu_qr_url',
  venta: 'id, numero, socio_id, recibo_id, realizada_en, estado, metodo_pago, subtotal, descuento, base_imponible, iva_total, total, importe_devuelto, devuelta_en, anulada_en, ventas_pos_lineas(id, tipo, nombre, cantidad, precio_unitario, descuento, iva_pct, base_imponible, iva_importe, total, devuelta_cantidad, orden)',
  devolucion: 'id, recibo_id, venta_pos_id, socio_id, origen, importe_cobrado, importe_devuelto, estado, stripe_charge_id, detectada_en, resuelta_en',
  suscripcion: 'id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes, baja_al_vencer, planes_tarifa(nombre, tipo)',
  // Sin `nombre_externo` (el nombre que manda ClassPass/USC) ni las marcas
  // internas del motor (recordatorios, bono, confirmación de riesgo).
  reserva: 'id, sesion_id, socio_id, estado, spot_id, creado_en, check_in_en, origen, cancelada_tardia, sesiones(inicio, fin, tipos_clase(nombre))',
  tarifa: 'id, nombre, descripcion, tipo, precio, sesiones, validez_dias, periodicidad_meses, matricula, activo',
} as const;

type Fila = Record<string, unknown>;
const s = (f: Fila, k: string) => (f[k] === undefined ? null : (f[k] as string | null));
const n = (f: Fila, k: string) => num(f[k] as number | string | null);

export function estudioPublico(f: Fila) {
  return {
    id: s(f, 'id'), nombre: s(f, 'nombre'), razonSocial: s(f, 'razon_social'), nif: s(f, 'nif'),
    direccion: s(f, 'direccion'), zonaHoraria: s(f, 'zona_horaria') ?? 'Europe/Madrid', moneda: MONEDA,
    ivaPorDefecto: n(f, 'iva_por_defecto'),
    // `sin_facturas`: Tentare no emite facturas para este estudio y las hace el
    // software contable a partir de los recibos.
    modoFacturacion: s(f, 'modo_facturacion'),
  };
}

export function clientaPublica(f: Fila, conDatosFiscales: boolean) {
  return {
    id: s(f, 'id'), nombre: s(f, 'nombre'), apellidos: s(f, 'apellidos'), email: s(f, 'email'),
    telefono: s(f, 'telefono'), activa: f.activo === true, fechaAlta: s(f, 'fecha_alta'),
    ...(conDatosFiscales ? { nif: s(f, 'nif'), direccion: s(f, 'direccion') } : {}),
  };
}

export function reciboPublico(f: Fila) {
  const paraCifras = {
    estado: String(f.estado ?? ''), importe: f.importe as number | string, importeDevuelto: f.importe_devuelto as number | string | null,
    reembolsoStripeId: s(f, 'reembolso_stripe_id'), reembolsoSolicitadoEn: s(f, 'reembolso_solicitado_en'),
  };
  const situacion: SituacionRecibo = situacionRecibo(paraCifras);
  return {
    id: s(f, 'id'), clientaId: s(f, 'socio_id'), suscripcionId: s(f, 'suscripcion_id'), concepto: s(f, 'concepto'),
    moneda: MONEDA,
    importe: centimos0(f.importe as number),
    importeDevuelto: centimos0(f.importe_devuelto as number),
    /** Lo que de verdad entró: el importe menos lo devuelto, y 0 si no se ha cobrado. */
    importeIngresado: Math.round(importeIngresado(paraCifras) * 100),
    estado: s(f, 'estado'),
    situacion,
    fechaVencimiento: s(f, 'fecha_vencimiento'), fechaCobro: s(f, 'fecha_cobro'), fechaDevolucion: s(f, 'fecha_devolucion'),
    metodoCobro: s(f, 'metodo_cobro'), esRenovacion: f.es_renovacion === true,
    stripePaymentIntentId: s(f, 'stripe_payment_intent_id'), anuladoEn: s(f, 'anulado_en'),
  };
}

export function facturaPublica(f: Fila) {
  return {
    id: s(f, 'id'), numero: s(f, 'numero_completo'), serie: s(f, 'serie'), tipo: s(f, 'tipo'),
    tipoRectificativa: s(f, 'tipo_rectificativa'), rectificaA: s(f, 'rectifica_a'),
    fechaEmision: s(f, 'fecha_emision'),
    receptor: { nombre: s(f, 'receptor_nombre'), nif: s(f, 'receptor_nif') },
    concepto: s(f, 'concepto'), moneda: MONEDA,
    baseImponible: aCentimos(f.base_imponible as number), tipoIva: n(f, 'tipo_iva'),
    cuotaIva: aCentimos(f.cuota_iva as number), total: aCentimos(f.total as number),
    importeRectificacion: aCentimos(f.importe_rectificacion as number),
    reciboId: s(f, 'recibo_id'), ventaId: s(f, 'venta_pos_id'),
    verifactu: { estado: s(f, 'verifactu_estado'), csv: s(f, 'verifactu_csv'), urlCotejo: s(f, 'verifactu_qr_url') },
  };
}

export function ventaPublica(f: Fila) {
  const lineas = Array.isArray(f.ventas_pos_lineas) ? (f.ventas_pos_lineas as Fila[]) : [];
  return {
    id: s(f, 'id'), numero: n(f, 'numero'), clientaId: s(f, 'socio_id'), reciboId: s(f, 'recibo_id'),
    fecha: s(f, 'realizada_en'), estado: s(f, 'estado'), metodoPago: s(f, 'metodo_pago'), moneda: MONEDA,
    subtotal: aCentimos(f.subtotal as number), descuento: aCentimos(f.descuento as number),
    baseImponible: aCentimos(f.base_imponible as number), ivaTotal: aCentimos(f.iva_total as number),
    total: aCentimos(f.total as number), importeDevuelto: centimos0(f.importe_devuelto as number),
    devueltaEn: s(f, 'devuelta_en'), anuladaEn: s(f, 'anulada_en'),
    lineas: [...lineas]
      .sort((a, b) => (n(a, 'orden') ?? 0) - (n(b, 'orden') ?? 0))
      .map((l) => ({
        id: s(l, 'id'), tipo: s(l, 'tipo'), nombre: s(l, 'nombre'), cantidad: n(l, 'cantidad'),
        precioUnitario: aCentimos(l.precio_unitario as number), descuento: aCentimos(l.descuento as number),
        tipoIva: n(l, 'iva_pct'), baseImponible: aCentimos(l.base_imponible as number),
        cuotaIva: aCentimos(l.iva_importe as number), total: aCentimos(l.total as number),
        cantidadDevuelta: n(l, 'devuelta_cantidad') ?? 0,
      })),
  };
}

export function devolucionPublica(f: Fila) {
  return {
    id: s(f, 'id'), reciboId: s(f, 'recibo_id'), ventaId: s(f, 'venta_pos_id'), clientaId: s(f, 'socio_id'),
    origen: s(f, 'origen'), moneda: MONEDA,
    importeCobrado: aCentimos(f.importe_cobrado as number), importeDevuelto: aCentimos(f.importe_devuelto as number),
    estado: s(f, 'estado'), stripeChargeId: s(f, 'stripe_charge_id'),
    detectadaEn: s(f, 'detectada_en'), resueltaEn: s(f, 'resuelta_en'),
  };
}

export function suscripcionPublica(f: Fila) {
  const plan = (f.planes_tarifa ?? null) as Fila | null;
  return {
    id: s(f, 'id'), clientaId: s(f, 'socio_id'), planId: s(f, 'plan_id'),
    planNombre: plan ? s(plan, 'nombre') : null,
    /** MENSUAL (cuota), BONO (sesiones) o PUNTUAL. */
    tipoPlan: plan ? s(plan, 'tipo') : null,
    estado: s(f, 'estado'), fechaInicio: s(f, 'fecha_inicio'), fechaFin: s(f, 'fecha_fin'),
    sesionesRestantes: n(f, 'sesiones_restantes'), bajaAlVencer: f.baja_al_vencer === true,
  };
}

/**
 * Una reserva. Conserva la forma con la que nació `GET /reservas` para Zapier
 * (`socioId`, `sesionId`, `spotId`, `creadoEn`): en v1 solo se AÑADEN campos.
 * `clientaId` repite `socioId` con el nombre del resto de la API.
 */
export function reservaPublica(f: Fila) {
  const sesion = (Array.isArray(f.sesiones) ? f.sesiones[0] : f.sesiones ?? null) as Fila | null;
  const tipo = sesion ? ((Array.isArray(sesion.tipos_clase) ? sesion.tipos_clase[0] : sesion.tipos_clase ?? null) as Fila | null) : null;
  return {
    id: s(f, 'id'), sesionId: s(f, 'sesion_id'), socioId: s(f, 'socio_id'), clientaId: s(f, 'socio_id'),
    /** CONFIRMADA, LISTA_ESPERA, PENDIENTE_APROBACION, CANCELADA, ASISTIDA o NO_ASISTIO. */
    estado: s(f, 'estado'), spotId: s(f, 'spot_id'), creadoEn: s(f, 'creado_en'),
    checkInEn: s(f, 'check_in_en'),
    /** TENTARE, o la plataforma por la que entró (CLASSPASS, URBAN_SPORTS_CLUB…): esas no tienen clienta. */
    origen: s(f, 'origen'),
    canceladaTardia: f.cancelada_tardia === true,
    clase: sesion ? { inicio: s(sesion, 'inicio'), fin: s(sesion, 'fin'), nombre: tipo ? s(tipo, 'nombre') : null } : null,
  };
}

export function tarifaPublica(f: Fila) {
  return {
    id: s(f, 'id'), nombre: s(f, 'nombre'), descripcion: s(f, 'descripcion'), tipo: s(f, 'tipo'),
    moneda: MONEDA, precio: aCentimos(f.precio as number), sesiones: n(f, 'sesiones'),
    validezDias: n(f, 'validez_dias'), periodicidadMeses: n(f, 'periodicidad_meses'),
    matricula: aCentimos(f.matricula as number), activa: f.activo === true,
  };
}
