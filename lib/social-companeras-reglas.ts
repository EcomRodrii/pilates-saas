// Reglas del grafo "compañeras de clase", sin Supabase — las usa
// `app/api/public/social/companeras/route.ts` y se prueban con `node --test`.
//
// El agujero que cierran (H3): cualquier socia con cuenta podía mandar una
// solicitud a CUALQUIER `socioId` del estudio (los ids cortos se adivinan) y el
// GET le devolvía nombre y apellidos de la destinataria. Eso se saltaba el
// opt-in `visible_en_clase` que respeta `social/clase/[sesionId]`, y permitía
// sacar la lista de clientas del estudio de una en una.

// Ids de `socios` en producción: solo [A-Za-z0-9_-], hasta 36 caracteres. El id
// del body acaba en un filtro `.or()` de PostgREST; con este formato no puede
// colar paréntesis ni comas.
const ID_SOCIA_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function esIdSociaValido(id: unknown): id is string {
  return typeof id === 'string' && ID_SOCIA_RE.test(id);
}

// "Compartir clase": las dos con reserva CONFIRMADA (futura o en curso) o
// ASISTIDA en la misma sesión. Es el mismo criterio que `social/clase/[sesionId]`
// (reservas CONFIRMADA de la sesión), más las pasadas a las que fueron de verdad.
// NO_ASISTIO, CANCELADA, LISTA_ESPERA y PENDIENTE_APROBACION no cuentan: nunca
// coincidieron en la sala.
export const ESTADOS_CLASE_COMPARTIDA = ['CONFIRMADA', 'ASISTIDA'] as const;

// Las pasadas solo cuentan si son recientes. Una clase de hace dos años no
// hace que alguien sea "compañera".
export const VENTANA_CLASE_COMPARTIDA_DIAS = 90;

const DIA_MS = 24 * 60 * 60 * 1000;

export function inicioVentanaClaseCompartida(ahora: Date): string {
  return new Date(ahora.getTime() - VENTANA_CLASE_COMPARTIDA_DIAS * DIA_MS).toISOString();
}

export interface ReservaParaClaseCompartida {
  socioId: string | null;
  sesionId: string | null;
  estado: string;
  /** `sesiones.fin` de la sesión de la reserva. */
  finSesion: string | null;
}

// La consulta ya filtra por estado y ventana. Se vuelve a filtrar aquí para que
// el criterio entero quede probado, y no dependa de que la query no cambie.
export function compartenClase(
  reservas: readonly ReservaParaClaseCompartida[],
  socioA: string,
  socioB: string,
  ahora: Date,
): boolean {
  if (socioA === socioB) return false;
  const desde = ahora.getTime() - VENTANA_CLASE_COMPARTIDA_DIAS * DIA_MS;
  const estados: readonly string[] = ESTADOS_CLASE_COMPARTIDA;
  const deA = new Set<string>();
  const deB = new Set<string>();
  for (const r of reservas) {
    if (!r.sesionId || !r.socioId) continue;
    if (!estados.includes(r.estado)) continue;
    const fin = r.finSesion ? Date.parse(r.finSesion) : Number.NaN;
    if (!Number.isFinite(fin) || fin < desde) continue;
    if (r.socioId === socioA) deA.add(r.sesionId);
    else if (r.socioId === socioB) deB.add(r.sesionId);
  }
  for (const sesionId of deA) if (deB.has(sesionId)) return true;
  return false;
}

// Se puede solicitar a quien tiene `visible_en_clase` (ya aceptó dejarse ver)
// o a quien comparte clase contigo. `destinataria: null` es "no existe en este
// estudio". El llamador responde a eso con el MISMO 403 que a "no elegible",
// para no revelar si el id existe.
export function puedeSolicitarCompanera(p: {
  solicitanteId: string;
  destinataria: { id: string; visibleEnClase: boolean } | null;
  compartenClase: boolean;
}): boolean {
  if (!p.destinataria) return false;
  if (p.destinataria.id === p.solicitanteId) return false;
  return p.destinataria.visibleEnClase || p.compartenClase;
}

export const NOMBRE_COMPANERA_NEUTRO = 'Una compañera de clase';

// Qué nombre ve una socia de la otra parte de una relación:
//   - `aceptada`: nombre y apellidos. Las dos dijeron que sí.
//   - `pendiente` que te llega a ti: nombre de pila de quien te escribe. Ella
//     se ha dirigido a ti, y sin nombre no puedes decidir si aceptar.
//   - resto (pendiente enviada, bloqueada): nombre de pila solo si la otra
//     tiene `visible_en_clase`; si no, un texto neutro. Enviar una solicitud
//     no te da nada que no pudieras ver ya en `social/clase/[sesionId]`.
// Nunca apellidos fuera de `aceptada`.
export function nombreOtraParte(p: {
  estado: string;
  otraEsSolicitante: boolean;
  otra: { nombre: string | null; apellidos: string | null; visibleEnClase: boolean } | null;
}): string {
  const nombre = p.otra?.nombre?.trim() ?? '';
  if (!p.otra || nombre === '') return NOMBRE_COMPANERA_NEUTRO;
  if (p.estado === 'aceptada') return `${nombre} ${p.otra.apellidos?.trim() ?? ''}`.trim();
  if (p.estado === 'pendiente' && p.otraEsSolicitante) return nombre;
  if (p.otra.visibleEnClase) return nombre;
  return NOMBRE_COMPANERA_NEUTRO;
}
