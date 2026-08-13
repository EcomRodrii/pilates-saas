import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarBajaMarketing } from '@/lib/marketing/unsubscribe-token';

// Endpoint PÚBLICO (sin login, clic desde un email): baja de marketing por
// email — LSSI/RGPD exigen que retirar el consentimiento sea tan fácil como
// darlo. El token ES la autorización (HMAC, sin expiración — ver
// lib/marketing/unsubscribe-token.ts), ligado a studioId+socioId, así que
// una socia solo puede darse de baja de SU PROPIO consentimiento. Devuelve
// HTML directo (se abre desde el cliente de correo, no desde la app).

function pagina(titulo: string, mensaje: string): NextResponse {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #f7f6f3; color: #1a1a1a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 420px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; color: #555; line-height: 1.5; margin: 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>${titulo}</h1>
    <p>${mensaje}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'marketing-baja', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token');
  const claim = verificarBajaMarketing(token);
  if (!claim) {
    return pagina('Enlace no válido', 'Este enlace de baja no es válido. Si quieres dejar de recibir estos emails, contacta directamente con el estudio.');
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return pagina('No disponible ahora mismo', 'No hemos podido procesar tu baja en este momento. Inténtalo de nuevo más tarde o contacta con el estudio.');
  }

  // No filtra si la socia existe o no en la respuesta (mismo trato para
  // ambos casos): un token válido siempre confirma la baja, evitando que el
  // endpoint sirva para comprobar si un id de socia existe.
  await admin.from('socios')
    .update({ consentimiento_marketing_en: null, consentimiento_marketing_texto: null, consentimiento_marketing_por: null })
    .eq('id', claim.socioId).eq('studio_id', claim.studioId);

  return pagina('Baja confirmada', 'Ya no recibirás más emails de marketing de este estudio. Seguirás recibiendo los avisos necesarios para tus reservas y pagos.');
}
