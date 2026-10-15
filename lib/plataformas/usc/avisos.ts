// Avisos de integrador de Urban Sports Club («Integrator Update», webhook tipo 4),
// sin base de datos.
//
// USC avisa cuando asocia, actualiza o quita a Tentare como integrador de un
// proveedor (un estudio suyo) y cuando le añade o termina una ubicación
// (docs.urbansportsclub.io, endpoint/webhooks). Aquí solo se traduce el cuerpo a
// un aviso validado.
//
// ⚠️ El aviso NO trae ningún dato de Tentare (ni id de estudio ni correo): solo
// el id de proveedor de USC y, solo en `IntegratorAssociated`, su nombre. Por eso
// NUNCA se aplica solo: queda pendiente de que la propietaria lo confirme
// (ver `emparejar.ts`).
// ⚠️ Los de ubicación NO traen `ModifiedDate` ni `ClientId`: no tienen orden.
// Puro, sin `@/`.

export type TipoAvisoIntegradorUsc =
  | 'IntegratorAssociated'
  | 'IntegratorUpdated'
  | 'IntegratorRemoved'
  | 'IntegratorLocationAdded'
  | 'IntegratorLocationTerminated';

const TIPOS: readonly TipoAvisoIntegradorUsc[] = [
  'IntegratorAssociated', 'IntegratorUpdated', 'IntegratorRemoved', 'IntegratorLocationAdded', 'IntegratorLocationTerminated',
];

export interface AvisoIntegradorUsc {
  tipo: TipoAvisoIntegradorUsc;
  /** UUID en minúsculas. */
  providerId: string;
  /** Solo `IntegratorAssociated`. */
  providerName: string | null;
  /** Solo los de ubicación. */
  locationId: string | null;
  locationName: string | null;
  /** ISO, o null. Las fechas de los avisos de proveedor; `EndDate` también en los de ubicación. */
  inicio: string | null;
  fin: string | null;
  /** ISO. `null` en los de ubicación: USC no se lo manda. */
  modificado: string | null;
  /** `ClientId` del cuerpo, si viene. */
  clientId: string | null;
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOMBRE = 200;

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const fecha = (v: unknown): string | null => {
  const t = texto(v);
  return t && !Number.isNaN(Date.parse(t)) ? t : null;
};
const uuid = (v: unknown): string | null => {
  const t = texto(v);
  return t && RE_UUID.test(t) ? t.toLowerCase() : null;
};

/** ¿Es un aviso de integrador (y no de reserva)? Lo decide el `Type` del cuerpo. */
export function esAvisoIntegradorUsc(cuerpo: unknown): boolean {
  return !!cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)
    && typeof (cuerpo as Record<string, unknown>).Type === 'string'
    && !('BookingStatus' in (cuerpo as Record<string, unknown>));
}

export function leerAvisoIntegradorUsc(cuerpo: unknown, ahora: number = Date.now()): { ok: true; aviso: AvisoIntegradorUsc } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'cuerpo no es un objeto' };
  const c = cuerpo as Record<string, unknown>;
  const tipo = c.Type;
  if (typeof tipo !== 'string' || !(TIPOS as readonly string[]).includes(tipo)) return { ok: false, error: 'Type desconocido' };
  const providerId = uuid(c.ProviderId);
  if (!providerId) return { ok: false, error: 'ProviderId no es un UUID' };
  const esUbicacion = tipo === 'IntegratorLocationAdded' || tipo === 'IntegratorLocationTerminated';
  const locationId = esUbicacion ? uuid(c.LocationId) : null;
  if (esUbicacion && !locationId) return { ok: false, error: 'LocationId no es un UUID' };
  const modificado = fecha(c.ModifiedDate);
  // Los de proveedor llevan ModifiedDate: sin ella no hay orden posible.
  if (!esUbicacion && !modificado) return { ok: false, error: 'ModifiedDate no válida' };
  // Una fecha en el futuro lejano (un aviso falso) quedaría «vigente» para siempre.
  if (modificado && Date.parse(modificado) > ahora + 24 * 3600 * 1000) return { ok: false, error: 'ModifiedDate en el futuro' };
  return {
    ok: true,
    aviso: {
      tipo: tipo as TipoAvisoIntegradorUsc,
      providerId,
      providerName: tipo === 'IntegratorAssociated' ? (texto(c.ProviderName)?.slice(0, MAX_NOMBRE) ?? null) : null,
      locationId,
      locationName: esUbicacion ? (texto(c.Name)?.slice(0, MAX_NOMBRE) ?? null) : null,
      inicio: fecha(c.StartDate),
      fin: fecha(c.EndDate),
      modificado,
      clientId: texto(c.ClientId)?.toLowerCase() ?? null,
    },
  };
}
