import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firmarTokenInstructora, verificarTokenInstructora, type ScopeToken } from './token.ts';

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

// P2-10: extraído de app/api/sustituciones/enlace-instructora/route.ts para que
// "copiar enlace" (una instructora) y "pedir disponibilidad por email" (muchas
// a la vez) generen y revoquen el enlace exactamente igual — dos caminos que
// decidieran esto por separado podrían acabar reconociendo como "vigentes" dos
// enlaces distintos para la misma instructora.
export async function obtenerOFirmarEnlace(
  admin: SupabaseClient,
  studioId: string,
  instructorId: string,
  scope: 'disponibilidad' | 'reportar_baja',
): Promise<string> {
  const { data: vigente } = await admin
    .from('instructor_enlaces_vigentes')
    .select('token').eq('instructor_id', instructorId).eq('scope', scope).maybeSingle();

  const token = vigente?.token && verificarTokenInstructora(vigente.token as string, scope as ScopeToken)
    ? (vigente.token as string)
    : firmarTokenInstructora(instructorId, studioId, scope as ScopeToken);

  if (token !== vigente?.token) {
    const { error } = await admin.from('instructor_enlaces_vigentes').upsert(
      { instructor_id: instructorId, studio_id: studioId, scope, token },
      { onConflict: 'instructor_id,scope' },
    );
    // Best-effort: si esto falla, el enlace firmado funciona igual — solo se
    // pierde la garantía de revocación en el próximo regenerado.
    if (error) console.error('[sustituciones] no se pudo registrar el enlace vigente', error);
  }
  return token;
}

/** Marca cuándo se mandó por email el enlace vigente de una instructora+scope. */
export async function marcarEnlaceEnviadoPorEmail(
  admin: SupabaseClient, instructorId: string, scope: 'disponibilidad' | 'reportar_baja',
): Promise<void> {
  const { error } = await admin.from('instructor_enlaces_vigentes')
    .update({ email_enviado_en: new Date().toISOString() })
    .eq('instructor_id', instructorId).eq('scope', scope);
  if (error) console.error('[sustituciones] no se pudo marcar el enlace como enviado', error);
}
