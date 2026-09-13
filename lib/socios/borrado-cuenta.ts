// ─────────────────────────────────────────────────────────────────────────────
// ¿Se puede borrar la cuenta de acceso (auth.users) de una socia suprimida?
//
// Una misma cuenta puede ser a la vez socia en otro estudio, instructora, dueña
// de un estudio o de una cadena, perfil de Network o admin de la plataforma.
// Suprimir a la socia de UN estudio no autoriza a borrar nada de eso: la cuenta
// solo se borra si no le queda ningún otro vínculo.
//
// ⚠️ Fail-closed: si algún recuento no se pudo hacer (`null`), NO se borra y
// queda pendiente. Borrar de más aquí deja a una instructora o a una dueña sin
// poder entrar; borrar de menos solo retrasa la supresión.
//
// Se llama DESPUÉS de `anonimizar_socio`, que ya ha desenlazado esta ficha: por
// eso cualquier fila restante en `socios` con la cuenta es OTRA ficha.
//
// Puro, sin I/O.
// ─────────────────────────────────────────────────────────────────────────────

export interface VinculoCuenta {
  clave: string;
  tabla: string;
  columna: string;
  descripcion: string;
}

export const VINCULOS_CUENTA: readonly VinculoCuenta[] = [
  { clave: 'otras_fichas_socia', tabla: 'socios', columna: 'auth_user_id', descripcion: 'otra ficha de socia' },
  { clave: 'instructora', tabla: 'instructores', columna: 'auth_user_id', descripcion: 'ficha de equipo' },
  { clave: 'duena_estudio', tabla: 'studios', columna: 'owner_auth_user_id', descripcion: 'dueña de un estudio' },
  { clave: 'duena_cadena', tabla: 'cadenas', columna: 'owner_auth_user_id', descripcion: 'dueña de una cadena' },
  { clave: 'perfil_network', tabla: 'red_perfiles', columna: 'auth_user_id', descripcion: 'perfil de Network' },
  { clave: 'perfil_network_alumna', tabla: 'red_perfiles_alumna', columna: 'auth_user_id', descripcion: 'perfil de Network (alumna)' },
  { clave: 'admin_plataforma', tabla: 'plataforma_admin', columna: 'auth_user_id', descripcion: 'admin de la plataforma' },
  { clave: 'permiso_plataforma', tabla: 'plataforma_permiso', columna: 'auth_user_id', descripcion: 'permiso de plataforma' },
];

/** Recuento por `clave` de VINCULOS_CUENTA. `null` = no se pudo contar. */
export type RecuentoVinculos = Record<string, number | null>;

export type DecisionCuenta =
  | { borrar: true }
  | { borrar: false; motivo: 'tiene_vinculos'; vinculos: string[] }
  | { borrar: false; motivo: 'no_verificable'; sinComprobar: string[] };

export function decidirBorradoCuenta(recuento: RecuentoVinculos): DecisionCuenta {
  // Un vínculo que ni siquiera figura en el recuento cuenta como no comprobado:
  // añadir uno a VINCULOS_CUENTA y olvidarse de contarlo no debe dar vía libre.
  const sinComprobar = VINCULOS_CUENTA
    .filter(v => typeof recuento[v.clave] !== 'number' || !Number.isFinite(recuento[v.clave]))
    .map(v => v.clave);
  if (sinComprobar.length > 0) return { borrar: false, motivo: 'no_verificable', sinComprobar };

  const vinculos = VINCULOS_CUENTA.filter(v => (recuento[v.clave] as number) > 0).map(v => v.clave);
  if (vinculos.length > 0) return { borrar: false, motivo: 'tiene_vinculos', vinculos };

  return { borrar: true };
}
