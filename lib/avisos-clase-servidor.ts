// ─────────────────────────────────────────────────────────────────────────────
// Avisos sobre una clase desde rutas de servidor con service-role (SERVER-ONLY).
//
// Las rutas que avisan a las alumnas de una clase cancelada o cambiada se fiaban
// de dos cosas del cliente: el rol (solo pedían sesión de staff) y el texto
// (clase, fecha, hora, sala, instructora llegaban en el body). Con eso cualquier
// persona del equipo podía mandar «tu clase se cancela» de una clase en pie, o
// con datos inventados.
//
// Aquí se resuelven las dos desde la BD: qué clases son del estudio, cuáles
// puede tocar quien llama (`puedeOperarClase`) y los textos del aviso. Quien
// llama a estas rutas ya ha guardado el cambio antes (el calendario espera la
// escritura), así que la BD dice lo mismo que la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SesionStaff } from '@/lib/auth-server';
import { instructorIdDeSesion } from '@/lib/datos-salud/acceso-servidor';
import { puedeOperarClase } from '@/lib/permisos-reglas';
import { fechaLargaEstudio, horaEstudio, cuandoEstudio } from '@/lib/utils';

export interface ClaseAviso {
  id: string;
  inicio: string;
  instructorId: string | null;
  cancelada: boolean;
  clase: string;
  sala: string;
  instructor: string;
  fecha: string;
  hora: string;
  cuando: string;
}

interface FilaSesion {
  id: string;
  inicio: string;
  instructor_id: string | null;
  cancelada: boolean | null;
  tipo_clase_id: string | null;
  sala_id: string | null;
}

async function nombresPorId(admin: SupabaseClient, tabla: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from(tabla).select('id, nombre').in('id', ids);
  return new Map(((data ?? []) as { id: string; nombre: string }[]).map(f => [f.id, f.nombre]));
}

/**
 * Las clases pedidas que son del estudio y que quien llama puede tocar, con los
 * textos del aviso sacados de la BD. `ajenas` cuenta las que existen pero no
 * son suyas (una instructora con la clase de otra). `null` si la consulta falla.
 */
export async function clasesParaAviso(
  admin: SupabaseClient, staff: SesionStaff, ids: readonly string[],
): Promise<{ clases: ClaseAviso[]; ajenas: number } | null> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return { clases: [], ajenas: 0 };

  const { data, error } = await admin.from('sesiones')
    .select('id, inicio, instructor_id, cancelada, tipo_clase_id, sala_id')
    .eq('studio_id', staff.studioId).in('id', unicos);
  if (error) return null;
  const filas = (data ?? []) as FilaSesion[];

  const propio = staff.rol === 'INSTRUCTOR' ? await instructorIdDeSesion(admin, staff) : null;
  const permitidas = filas.filter(f => puedeOperarClase(staff.rol, !!propio && f.instructor_id === propio));

  const unir = (k: 'tipo_clase_id' | 'sala_id' | 'instructor_id') =>
    [...new Set(permitidas.map(f => f[k]).filter((v): v is string => !!v))];
  const [tipos, salas, instructoras] = await Promise.all([
    nombresPorId(admin, 'tipos_clase', unir('tipo_clase_id')),
    nombresPorId(admin, 'salas', unir('sala_id')),
    nombresPorId(admin, 'instructores', unir('instructor_id')),
  ]);

  const clases = permitidas.map(f => ({
    id: f.id,
    inicio: f.inicio,
    instructorId: f.instructor_id,
    cancelada: f.cancelada === true,
    clase: (f.tipo_clase_id && tipos.get(f.tipo_clase_id)) || 'tu clase',
    sala: (f.sala_id && salas.get(f.sala_id)) || '',
    instructor: (f.instructor_id && instructoras.get(f.instructor_id)) || '',
    fecha: fechaLargaEstudio(f.inicio),
    hora: horaEstudio(f.inicio),
    cuando: cuandoEstudio(f.inicio),
  }));
  return { clases, ajenas: filas.length - permitidas.length };
}

/**
 * «Antes la daba X»: el nombre llega del cliente, así que solo se acepta si es
 * el de alguien del equipo del estudio. Si no, el correo sale sin esa línea.
 */
export async function nombreDeCompanera(
  admin: SupabaseClient, studioId: string, nombre: unknown,
): Promise<string | undefined> {
  if (typeof nombre !== 'string' || !nombre.trim()) return undefined;
  const { data } = await admin.from('instructores').select('id')
    .eq('studio_id', studioId).eq('nombre', nombre.trim()).limit(1);
  return data && data.length > 0 ? nombre.trim() : undefined;
}
