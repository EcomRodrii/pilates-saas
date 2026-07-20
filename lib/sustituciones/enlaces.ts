import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeToken } from '@/lib/sustituciones/token';

// Un solo enlace "vigente" por instructora+scope a la vez (tabla
// instructor_enlaces_vigentes, migración 0057). Comparación en tiempo
// constante: son strings opacos de alta entropía, pero mismo estilo defensivo
// que el resto de este módulo (ver lib/sustituciones/token.ts).
export function mismoToken(recibido: string, almacenado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(almacenado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Solo cubre 'disponibilidad' y 'reportar_baja' (los únicos scopes que pasan
// por instructor_enlaces_vigentes, migración 0057). Úsalo DESPUÉS de que
// verificarTokenInstructora ya haya validado firma+scope+caducidad — esto
// comprueba, además, que sea el enlace que reconocemos como el vigente.
//
// Sin fila guardada → false (no revocado): los enlaces emitidos antes de que
// existiera esta tabla no tienen con qué compararse, y tratarlos como
// revocados rompería de golpe cualquier enlace ya entregado a una instructora.
export async function enlaceRevocado(
  admin: SupabaseClient,
  instructorId: string,
  scope: ScopeToken,
  tokenRecibido: string,
): Promise<boolean> {
  const { data } = await admin
    .from('instructor_enlaces_vigentes')
    .select('token').eq('instructor_id', instructorId).eq('scope', scope).maybeSingle();
  if (!data?.token) return false;
  return !mismoToken(tokenRecibido, data.token);
}
