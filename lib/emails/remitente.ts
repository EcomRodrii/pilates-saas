// RESEND_FROM en producción es una única dirección verificada para TODO el
// producto (`Tentare <hola@tentare.es>`, ver docs/DEPLOY.md) — si un
// *-server.ts hiciera `process.env.RESEND_FROM || 'Tentare Core <...>'`, el
// nombre de marca por rol nunca se vería en producción: el env var gana
// siempre y pisa el fallback entero. Esta función recompone el display name
// sobre la MISMA dirección configurada, así que el remitente cambia por rol
// tanto si RESEND_FROM está puesto como si no.
export function remitentePorMarca(marca: string): string {
  const configurado = process.env.RESEND_FROM;
  const email = configurado?.match(/<([^>]+)>/)?.[1] ?? configurado ?? 'onboarding@resend.dev';
  return `${marca} <${email}>`;
}
