// ─────────────────────────────────────────────────────────────────────────────
// Panel interno — verificación en dos pasos (reglas puras).
//
// `/interno` lee datos de TODOS los estudios con service-role. Hasta ahora
// bastaba la contraseña de un admin para entrar. Estas reglas deciden cuándo
// se exige un segundo factor y qué pantalla toca. Viven aquí, sin imports,
// para probarlas con `node --test`. Las usan el servidor (`auth.ts`) y la
// pantalla `/interno/mfa`.
//
// El despliegue va en dos tiempos para no dejar fuera a nadie:
//   1. Sin `INTERNO_EXIGIR_MFA`, todo funciona igual que antes y cada admin
//      puede enrolar su factor desde `/interno/mfa`.
//   2. Con `INTERNO_EXIGIR_MFA=1`, cualquier sesión que no sea `aal2` recibe
//      `MFA_REQUERIDO` y la UI la manda a verificar.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelAal = 'aal1' | 'aal2';

// Lee el claim `aal` del access token.
//
// ⚠️ NO verifica la firma, y es seguro SOLO porque quien la llama ya ha pasado
// ese mismo token por `supabase.auth.getUser(token)` (`verificarUsuarioSupabase`):
// GoTrue comprueba firma, caducidad y que la sesión siga viva. Si alguien
// retoca el payload para poner `aal2`, la firma deja de cuadrar y `getUser`
// falla antes de llegar aquí. Usarla con un token que no haya pasado por ahí
// sería confiar en lo que escribe el cliente.
//
// Un token sin `aal`, o que no se deja leer, cuenta como `aal1`: la
// documentación de Supabase dice lo mismo, y ante la duda nunca se sube nivel.
export function nivelAutenticacion(accessToken: string | null | undefined): NivelAal {
  if (!accessToken) return 'aal1';
  const partes = accessToken.split('.');
  if (partes.length !== 3 || !partes[1]) return 'aal1';
  try {
    // atob + TextDecoder y no Buffer: este módulo también llega al navegador.
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(relleno), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { aal?: unknown };
    return payload.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

// Solo el valor exacto '1' activa la exigencia. Un 'true' o un ' 1' no:
// preferible que un error al escribir la variable se note porque NO exige,
// antes que dejar fuera a todo el equipo sin querer.
export function exigeMfa(
  env: Readonly<Record<string, string | undefined>>,
  nivel: NivelAal,
): boolean {
  return env.INTERNO_EXIGIR_MFA === '1' && nivel !== 'aal2';
}

// Sin aal2 solo se puede crear el PRIMER factor. Si ya hay uno verificado,
// añadir otro exige haber pasado por él. Si no, quien robe la contraseña
// podría registrar su propio autenticador en una cuenta que ya tiene uno.
//
// GoTrue también lo rechaza en su lado (`insufficient_aal`), porque el enrol va
// del navegador directo a Supabase y esta regla por sí sola sería solo UI.
export function puedeEnrolarFactor(factoresVerificados: number, nivel: NivelAal): boolean {
  return factoresVerificados === 0 || nivel === 'aal2';
}

export type PasoMfa = 'enrolar' | 'verificar' | 'listo';

export function pasoMfa(factoresVerificados: number, nivel: NivelAal): PasoMfa {
  if (nivel === 'aal2') return 'listo';
  return factoresVerificados > 0 ? 'verificar' : 'enrolar';
}

// A dónde volver tras verificar. Solo rutas de `/interno`: el parámetro llega
// por la URL y, sin esta lista blanca, sería una redirección abierta.
export function destinoTrasMfa(volver: string | null | undefined): string {
  if (!volver || !volver.startsWith('/interno') || volver.startsWith('//') || volver.includes('\\')) {
    return '/interno';
  }
  if (volver === '/interno/mfa' || volver.startsWith('/interno/mfa?') || volver.startsWith('/interno/mfa/')) {
    return '/interno';
  }
  return volver;
}
