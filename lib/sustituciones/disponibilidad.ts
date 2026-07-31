import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';
import { FRANJAS, celdaKey, parseCeldaKey, franjaPorHoraInicio } from './franjas.ts';

// Núcleo de "leer/guardar disponibilidad", compartido por la vía pública
// (`app/api/public/disponibilidad`, token firmado) y la vía autenticada
// (`app/api/mi-disponibilidad`, sesión de staff) — la lógica de negocio es
// idéntica vengan de donde vengan; la única diferencia legítima es CÓMO se
// autoriza a cada una (eso lo decide cada ruta, no este módulo).

export async function leerDisponibilidad(admin: SupabaseClient, instructorId: string): Promise<string[]> {
  const { data: filas } = await admin
    .from('instructora_disponibilidad')
    .select('dia_semana, hora_inicio')
    .eq('instructor_id', instructorId);

  return (filas ?? [])
    .map((f) => {
      const franja = franjaPorHoraInicio(String(f.hora_inicio));
      return franja ? celdaKey(f.dia_semana as number, franja) : null;
    })
    .filter((c): c is string => c !== null);
}

// Reemplazo completo: borra lo anterior de ESTA instructora e inserta lo nuevo.
export async function guardarDisponibilidad(
  admin: SupabaseClient,
  p: { studioId: string; instructorId: string; celdasRaw: unknown },
): Promise<{ ok: true; guardadas: number } | { ok: false; error: string }> {
  const brutas = Array.isArray(p.celdasRaw) ? (p.celdasRaw as unknown[]) : [];
  const validas = new Map<string, { dow: number; franja: string }>();
  for (const c of brutas) {
    if (typeof c !== 'string') continue;
    const parsed = parseCeldaKey(c);
    if (parsed) validas.set(c, parsed);
  }

  const filas = Array.from(validas.values()).map(({ dow, franja }) => {
    const f = FRANJAS.find((x) => x.key === franja)!;
    return {
      id: `disp-${uid()}`,
      studio_id: p.studioId,
      instructor_id: p.instructorId,
      dia_semana: dow,
      hora_inicio: f.horaInicio,
      hora_fin: f.horaFin,
    };
  });

  // P2-14: filtra también por studio_id — defensa en profundidad. Con el
  // UNIQUE(auth_user_id, studio_id) de `instructores`, un `instructorId` ya
  // identifica unívocamente sede+persona, pero si algún día una fila queda
  // huérfana de sede por un bug de datos, este filtro evita que el borrado
  // se salga de su sede y arrastre la disponibilidad de otra.
  const del = await admin
    .from('instructora_disponibilidad').delete().eq('instructor_id', p.instructorId).eq('studio_id', p.studioId);
  if (del.error) return { ok: false, error: 'No se ha podido guardar tu disponibilidad. Vuelve a intentarlo en unos segundos.' };

  if (filas.length > 0) {
    const ins = await admin.from('instructora_disponibilidad').insert(filas);
    if (ins.error) return { ok: false, error: 'No se ha podido guardar tu disponibilidad. Vuelve a intentarlo en unos segundos.' };
  }

  return { ok: true, guardadas: filas.length };
}
