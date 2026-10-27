// La cuenta de demostración que se da a la revisión de Apple (App Store Connect →
// «Información de inicio de sesión»). El revisor no puede leer el correo donde llega
// el código de 6 cifras, así que para ESAS cuentas la app salta el código y pide
// directamente la contraseña.
//
// ⚠️ Los emails NO viven en el repositorio (es público): van en la variable de entorno
// `CUENTA_REVISION_APPLE`, separados por comas. Sin la variable, ninguna cuenta es de
// revisión y la entrada es la de siempre. Esto solo cambia QUÉ PANTALLA se enseña: la
// contraseña la sigue comprobando Supabase como a cualquier otra cuenta.

export function esCuentaDeRevision(email: string, lista: string | undefined = process.env.CUENTA_REVISION_APPLE): boolean {
  const buscado = email.trim().toLowerCase();
  if (!buscado || !lista) return false;
  return lista.split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes(buscado);
}
