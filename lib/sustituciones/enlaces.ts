import { timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firmarTokenInstructora, firmarTokenInvitacion, verificarTokenInstructora, type ScopeToken } from './token.ts';

// Un solo enlace "vigente" por instructora+scope a la vez (tabla
// instructor_enlaces_vigentes, migración 0057). Comparación en tiempo
// constante: son strings opacos de alta entropía, pero mismo estilo defensivo
// que el resto de este módulo (ver lib/sustituciones/token.ts).
export function mismoToken(recibido: string, almacenado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(almacenado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Cubre 'disponibilidad', 'reportar_baja' e 'invitacion' (los scopes que
// pasan por instructor_enlaces_vigentes — migración 0057, ampliada en
// 20260905014901 para incluir 'invitacion'). Úsalo DESPUÉS de que
// verificarTokenInstructora ya haya validado firma+scope+caducidad — esto
// comprueba, además, que sea el enlace que reconocemos como el vigente.
//
// Sin fila guardada: una INVITACIÓN cuenta como revocada (13-oct-2026). Desde
// el 5-sep cada invitación se registra al emitirla (`emitirInvitacion`, que falla
// si no puede), y las firmadas antes de esa fecha caducaron como tarde el 5-oct.
// Disponibilidad y «No puedo asistir» siguen como siempre (sin fila → vale): son
// enlaces de 30 días que la instructora guarda, y tratarlos como revocados
// rompería de golpe alguno ya entregado.
// ⚠️ Nunca DELETE de esta tabla para revocar: un centinela (`ENLACE_USADO`, el de
// la purga), porque en los otros scopes una fila borrada reabre el enlace.
export async function enlaceRevocado(
  admin: SupabaseClient,
  instructorId: string,
  scope: ScopeToken,
  tokenRecibido: string,
): Promise<boolean> {
  const { data } = await admin
    .from('instructor_enlaces_vigentes')
    .select('token').eq('instructor_id', instructorId).eq('scope', scope).maybeSingle();
  if (!data?.token) return scope === 'invitacion';
  return !mismoToken(tokenRecibido, data.token);
}

// P2-10: extraído de app/api/sustituciones/enlace-instructora/route.ts para que
// "copiar enlace" (una instructora) y "pedir disponibilidad por email" (muchas
// a la vez) generen y revoquen el enlace exactamente igual — dos caminos que
// decidieran esto por separado podrían acabar reconociendo como "vigentes" dos
// enlaces distintos para la misma instructora.
//
// La invitación al equipo NO pasa por aquí: va por `emitirInvitacion`, que nunca
// reutiliza.
export async function obtenerOFirmarEnlace(
  admin: SupabaseClient,
  studioId: string,
  instructorId: string,
  scope: 'disponibilidad' | 'reportar_baja',
): Promise<string> {
  const { data: vigente } = await admin
    .from('instructor_enlaces_vigentes')
    .select('token').eq('instructor_id', instructorId).eq('scope', scope).maybeSingle();

  const valido = vigente?.token ? verificarTokenInstructora(vigente.token as string, scope) : null;
  const token = valido ? (vigente!.token as string) : firmarTokenInstructora(instructorId, studioId, scope);

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

// La invitación al equipo: cada envío firma un enlace NUEVO y revoca el anterior
// (13-oct-2026; antes se reutilizaba el vigente). Corregir el correo de la ficha
// y reenviar deja sin valor el enlace anterior. Lleva firmados quién invita y el
// rol de la ficha (`firmarTokenInvitacion`).
//
// A diferencia de `obtenerOFirmarEnlace`, si no se puede registrar como vigente
// FALLA: sin fila, `enlaceRevocado` da la invitación por revocada, y mandar un
// enlace que no va a funcionar es peor que decir que no se ha podido.
export async function emitirInvitacion(
  admin: SupabaseClient,
  studioId: string,
  instructorId: string,
  emisor: string,
  rolFicha: string,
): Promise<string> {
  const token = firmarTokenInvitacion(instructorId, studioId, emisor, rolFicha);
  const { error } = await admin.from('instructor_enlaces_vigentes').upsert(
    { instructor_id: instructorId, studio_id: studioId, scope: 'invitacion', token },
    { onConflict: 'instructor_id,scope' },
  );
  if (error) throw error;
  return token;
}

/** Lo que queda como «vigente» cuando una invitación ya se ha canjeado: ningún token firmado coincide con esto. */
export const ENLACE_USADO = 'usado-al-vincular';

// Una invitación se canjea una vez (13-oct-2026): aunque la ficha vuelva a
// quedarse sin cuenta (cambio de correo, baja y vuelta), ese enlace ya no vale.
// La llaman las dos puertas que unen una cuenta a su ficha (`equipoReclamarAction`
// y `unirse`, por enlace o por correo); el alta entre sedes de `equipoAction` no
// pasa por aquí. Se llama DESPUÉS de vincular: si falla, el acceso ya está dado y
// no se deshace; quien llama lo apunta.
export async function gastarInvitacion(
  admin: SupabaseClient,
  studioId: string,
  instructorId: string,
): Promise<void> {
  const { error } = await admin.from('instructor_enlaces_vigentes').upsert(
    { instructor_id: instructorId, studio_id: studioId, scope: 'invitacion', token: ENLACE_USADO },
    { onConflict: 'instructor_id,scope' },
  );
  if (error) throw error;
}

/** Marca cuándo se mandó por email el enlace vigente de una instructora+scope. */
export async function marcarEnlaceEnviadoPorEmail(
  admin: SupabaseClient, instructorId: string, scope: 'disponibilidad' | 'reportar_baja' | 'invitacion',
): Promise<void> {
  const { error } = await admin.from('instructor_enlaces_vigentes')
    .update({ email_enviado_en: new Date().toISOString() })
    .eq('instructor_id', instructorId).eq('scope', scope);
  if (error) console.error('[sustituciones] no se pudo marcar el enlace como enviado', error);
}
