// ¿Ve esta visita el login nuevo (la piel del onboarding al estilo Shopify)? Puro, sin React ni red.
// El login se ve ANTES de saber qué estudio entra, así que no sirve un interruptor por estudio:
// `LOGIN_NUEVO`, leído SOLO en el servidor (app/login/page.tsx).
//
// Abierto a todo el mundo desde el 19-nov-2026 (decisión del fundador). Solo `off` lo apaga (el freno de
// emergencia: exige un despliegue).
//
//   off     → el de siempre
//   lo demás (sin poner, `on`, `prueba`…) → el nuevo (`?login=viejo` enseña el de siempre, salvo con `on`)

export function loginNuevoVisible(valor: string | undefined, parametro: string | string[] | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'off') return false;
  // `prueba` era el modo de antes de abrirlo a todos: una variable que se quedó así en Vercel ya no lo esconde.
  // `?login=viejo` enseña el de siempre solo para comparar (sin variable que lo imponga).
  return (Array.isArray(parametro) ? parametro[0] : parametro) !== 'viejo' || v === 'on';
}
