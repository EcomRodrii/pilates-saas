// ¿Ve esta visita el login nuevo (la piel del onboarding al estilo Shopify)? Puro, sin React ni red.
// El login se ve ANTES de saber qué estudio entra, así que no sirve un interruptor por estudio:
// `LOGIN_NUEVO`, leído SOLO en el servidor (app/login/page.tsx), con el formato del alta nueva.
//
//   on      → todo el mundo
//   prueba  → solo con `/login?login=nuevo`
//   lo demás (o sin poner) → el de siempre, también con `?login=nuevo`

export function loginNuevoVisible(valor: string | undefined, parametro: string | string[] | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  if (v === 'on') return true;
  if (v === 'prueba') return (Array.isArray(parametro) ? parametro[0] : parametro) === 'nuevo';
  return false;
}
