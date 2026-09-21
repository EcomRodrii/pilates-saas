import { nifValido } from '../nif.ts';
import { inicioDelDiaEstudio } from '../utils.ts';
import type { EstadoCobroCuenta } from '../billing/cuenta-puede-cobrar.ts';

// «¿Lista para abrir?» Cada punto mira el estado REAL (lo que usan el checkout,
// la página de reservas o el sellado de facturas), no si hay algo en una
// columna. Lo que no se ha podido comprobar sale como SIN_COMPROBAR y cuenta
// como no listo: nunca un ✓ sin haberlo mirado.

/** Id del bloque en la home, para que la alerta lleve directo a él. */
export const ANCLA_LISTO = 'lista-para-abrir';

export type IdComprobacion = 'clases' | 'pagina' | 'venta' | 'stripe' | 'fiscal' | 'antelacion';
export type EstadoComprobacion = 'OK' | 'FALTA' | 'SIN_COMPROBAR';

export interface Comprobacion {
  id: IdComprobacion;
  titulo: string;
  /** Lo que falta, con su cifra. Vacío si está OK. */
  detalle: string;
  estado: EstadoComprobacion;
  bloquea: boolean;
  /** null: su rol no puede abrir la pantalla que lo arregla. */
  href: string | null;
}

export interface SesionListo {
  inicio: string;
  cancelada: boolean;
  tipoClaseId: string | null;
  instructorId: string | null;
  aforoMaximo: number;
}

export interface PlanListo { id: string; activo: boolean; precio: number }

export interface DatosListo {
  /** Sesiones de la ventana de apertura (ver ventanaListo). */
  sesiones: SesionListo[];
  slug: string | null;
  exigirPlan: boolean;
  planes: PlanListo[];
  /** Tipos que cubre cada plan; sin entrada (o vacía) = cubre todos, como el checkout. */
  tiposPorPlan: Record<string, string[]>;
  /** SIN_CUENTA: ni siquiera ha empezado a conectar Stripe. */
  stripe: EstadoCobroCuenta | 'SIN_CUENTA';
  fiscal: { nif: string | null; razonSocial: string | null; direccion: string | null; codigoPostal: string | null; ciudad: string | null };
  antelacionMaximaDias: number | null;
}

const DIA = 86_400_000;
const DIAS_SIN_FECHA = 14;
const DIAS_SEMANA_APERTURA = 7;

/** La semana de apertura (o desde hoy si ya pasó); sin fecha, los próximos 14 días. */
export function ventanaListo(fechaApertura: string | null, now: Date): { desde: Date; hasta: Date } {
  if (!fechaApertura) return { desde: now, hasta: new Date(now.getTime() + DIAS_SIN_FECHA * DIA) };
  const apertura = new Date(inicioDelDiaEstudio(fechaApertura));
  const desde = apertura.getTime() > now.getTime() ? apertura : now;
  return { desde, hasta: new Date(desde.getTime() + DIAS_SEMANA_APERTURA * DIA) };
}

export const HREF_LISTO: Record<IdComprobacion, string> = {
  clases: '/calendario',
  pagina: '/configuracion?tab=estudio',
  venta: '/productos',
  stripe: '/configuracion?tab=cobros#integracion-stripe',
  fiscal: '/configuracion?tab=cobros#datos-fiscales',
  antelacion: '/configuracion?tab=reservas#reservar',
};

/** Lo que hay que hacer, para el brief («Siguiente paso: …»). */
export const ACCION_LISTO: Record<IdComprobacion, string> = {
  clases: 'Publica las clases de tu apertura',
  pagina: 'Pon la dirección de tu página de reservas',
  venta: 'Pon a la venta un plan que cubra tus clases',
  stripe: 'Deja Stripe listo para cobrar',
  fiscal: 'Completa tus datos fiscales',
  antelacion: 'Revisa con cuánta antelación se puede reservar',
};

const n = (x: number, uno: string, varios: string) => `${x} ${x === 1 ? uno : varios}`;
const relleno = (s: string | null) => !s || s.trim() === '';

export function evaluarListo(d: DatosListo, now: Date, puedeAbrir: (href: string) => boolean): Comprobacion[] {
  const out: Omit<Comprobacion, 'href'>[] = [];
  const vivas = d.sesiones.filter(s => !s.cancelada);
  const reservables = vivas.filter(s => s.tipoClaseId && s.instructorId && s.aforoMaximo > 0);

  // 1 · Clases que se pueden reservar en la ventana de apertura.
  const incompletas = vivas.length - reservables.length;
  out.push({
    id: 'clases', titulo: 'Clases para tu apertura', bloquea: true,
    estado: reservables.length > 0 ? 'OK' : 'FALTA',
    detalle: reservables.length > 0 ? ''
      : incompletas > 0 ? `${n(incompletas, 'clase', 'clases')} sin instructora, tipo o plazas: así no se pueden reservar.`
      : 'No hay clases en la semana de apertura: nadie puede reservar.',
  });

  // 2 · Dirección pública de reservas.
  out.push({
    id: 'pagina', titulo: 'Tu página de reservas', bloquea: true,
    estado: d.slug ? 'OK' : 'FALTA',
    detalle: d.slug ? '' : 'Tu estudio no tiene dirección pública todavía.',
  });

  // 3 · Algo que vender, con las mismas reglas que el checkout.
  const vendibles = d.planes.filter(p => p.activo && p.precio > 0);
  const tiposClases = new Set(reservables.map(s => s.tipoClaseId!));
  const cubre = (p: PlanListo) => {
    const tipos = d.tiposPorPlan[p.id] ?? [];
    return tipos.length === 0 || tipos.some(t => tiposClases.has(t));
  };
  const cubren = d.exigirPlan && tiposClases.size > 0 ? vendibles.filter(cubre) : vendibles;
  out.push({
    id: 'venta', titulo: 'Algo que vender', bloquea: d.exigirPlan,
    estado: cubren.length > 0 ? 'OK' : 'FALTA',
    detalle: cubren.length > 0 ? ''
      : vendibles.length > 0 ? 'Pides bono para reservar y ninguno de tus planes a la venta cubre las clases de tu apertura.'
      : d.exigirPlan ? 'Pides bono para reservar y no tienes ningún plan a la venta.'
      : 'No tienes ningún plan a la venta.',
  });

  // 4 · Stripe que cobra de verdad (charges_enabled), no solo conectado.
  out.push({
    id: 'stripe', titulo: 'Cobro online', bloquea: d.exigirPlan,
    estado: d.stripe === 'PUEDE' ? 'OK' : d.stripe === 'SIN_RESPUESTA' ? 'SIN_COMPROBAR' : 'FALTA',
    detalle: d.stripe === 'PUEDE' ? ''
      : d.stripe === 'SIN_CUENTA' ? 'Stripe sin conectar: nadie puede comprar un bono desde tu página.'
      : d.stripe === 'NO_PUEDE' ? 'Stripe está conectado pero aún no puede cobrar: termina la verificación en Stripe.'
      : 'Stripe no ha contestado. Vuelve a comprobarlo en un momento.',
  });

  // 5 · Datos fiscales como los pide la factura (NIF con dígito de control).
  const f = d.fiscal;
  const faltan = [
    !nifValido(f.nif) && 'NIF válido',
    relleno(f.razonSocial) && 'razón social',
    relleno(f.direccion) && 'dirección',
    relleno(f.codigoPostal) && 'código postal',
    relleno(f.ciudad) && 'ciudad',
  ].filter((x): x is string => !!x);
  out.push({
    id: 'fiscal', titulo: 'Datos fiscales', bloquea: true,
    estado: faltan.length === 0 ? 'OK' : 'FALTA',
    detalle: faltan.length === 0 ? '' : `Falta: ${faltan.join(', ')}. Sin ellos no se pueden emitir facturas.`,
  });

  // 6 · La primera clase ya se puede reservar hoy (solo si hay clase que mirar).
  const primera = [...reservables].sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  if (primera && d.antelacionMaximaDias !== null) {
    const abre = new Date(new Date(primera.inicio).getTime() - d.antelacionMaximaDias * DIA);
    const falta = abre.getTime() > now.getTime();
    out.push({
      id: 'antelacion', titulo: 'Reservas abiertas', bloquea: false,
      estado: falta ? 'FALTA' : 'OK',
      detalle: falta
        ? `Solo dejas reservar con ${n(d.antelacionMaximaDias, 'día', 'días')} de antelación: tu primera clase no se podrá reservar hasta el ${abre.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })}.`
        : '',
    });
  }

  return out.map(c => ({ ...c, href: puedeAbrir(HREF_LISTO[c.id]) ? HREF_LISTO[c.id] : null }));
}

/**
 * Imprescindibles que FALTAN de verdad: lo que alimenta la alerta y el brief.
 * SIN_COMPROBAR no entra: un corte de Stripe no puede mandarle a la propietaria
 * un aviso crítico de algo que no se ha confirmado (la pantalla sí lo enseña).
 */
export const bloqueantesPendientes = (cs: Comprobacion[]) => cs.filter(c => c.bloquea && c.estado === 'FALTA');
