// El payload de un JWT, SIN verificar la firma. La firma la comprueba Supabase
// cuando el token se usa; aquí solo se lee para decidir algo en la interfaz
// (p.ej. si un token viene de verificar el correo), y cualquier cosa rara da
// `null` para que quien pregunte falle cerrado.
export function payloadJwt(token: unknown): unknown {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  const b64url = partes[1];
  if (!/^[A-Za-z0-9_-]+$/.test(b64url)) return null;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  try {
    const binario = atob(b64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}
