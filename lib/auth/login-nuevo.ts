// ¿Ve esta visita el login nuevo (la piel del onboarding al estilo Shopify)? Puro, sin React ni red.
// El login se ve ANTES de saber qué estudio entra, así que no sirve un interruptor por estudio:
// `LOGIN_NUEVO`, leído SOLO en el servidor (app/login/page.tsx).
//
// Abierto a todo el mundo desde el 19-nov-2026 (decisión del fundador). Solo `off` lo apaga (el freno de
// emergencia: exige un despliegue); `?login=viejo` enseña el de siempre solo con `LOGIN_NUEVO=prueba`.
//
//   off     → el de siempre
//   prueba  → el de siempre, salvo `/login?login=nuevo`
//   lo demás (o sin poner, o `on`) → el nuevo

export function loginNuevoVisible(valor: string | undefined, parametro: string | string[] | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'off') return false;
  if (v === 'prueba') return (Array.isArray(parametro) ? parametro[0] : parametro) === 'nuevo';
  return true;
}
