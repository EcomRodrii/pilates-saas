// Decisión de "a dónde mando a esta cuenta tras iniciar sesión" — pura, sin
// imports de Next.js, para poder probarla con node --test sin mockear
// NextRequest/Supabase (ver routing-post-login.test.ts). El único caller
// real es app/api/auth/destino-post-login/route.ts, que resuelve los dos
// datos que hacen falta (verificarSesionStaff, red_perfiles.estado) y le
// pasa el resultado — la lógica de "a quién le pregunto" vive ahí, la de
// "qué hago con la respuesta" vive aquí.
export function resolverDestinoPostLogin(tieneEstudio: boolean, estadoPerfilNetwork: string | null): string {
  if (tieneEstudio) return '/dashboard';
  // 'en_revision' va a mi-perfil, no a reanudar: el wizard ya se terminó,
  // solo falta que el equipo de Tentare lo apruebe — reanudar es para el
  // onboarding a MEDIAS, no para "completo, esperando revisión".
  return estadoPerfilNetwork === 'published' || estadoPerfilNetwork === 'en_revision'
    ? '/network/mi-perfil' : '/network/reanudar';
}
