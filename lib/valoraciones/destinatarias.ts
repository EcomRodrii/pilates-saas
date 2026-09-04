// A quién se le pide valorar una clase. Sin imports ni `@/` (ver reglas.ts).
//
// Regla de producto: SOLO a quien ASISTIÓ. `alumnas_apuntadas` (RPC compartida
// con sustituciones) devuelve CONFIRMADAS, que es lo contrario de lo que hace
// falta aquí: cuando el estudio pasa lista, las que fueron dejan de ser
// CONFIRMADA y salían de la invitación, y las que no aparecieron seguían dentro.

export interface ReservaMin { socio_id: string; estado: string }
export interface SocioMin { id: string; nombre: string; apellidos: string | null; email: string | null; borrado_en: string | null }
export interface Destinataria { socio_id: string; nombre: string; email: string | null }

export function destinatariasValoracion(reservas: ReservaMin[], socios: SocioMin[]): Destinataria[] {
  const porId = new Map(socios.map((s) => [s.id, s]));
  const vistas = new Set<string>();
  const out: Destinataria[] = [];
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA' || vistas.has(r.socio_id)) continue;
    const s = porId.get(r.socio_id);
    if (!s || s.borrado_en) continue;
    vistas.add(r.socio_id);
    out.push({ socio_id: s.id, nombre: `${s.nombre} ${s.apellidos ?? ''}`.trim(), email: s.email });
  }
  return out;
}
