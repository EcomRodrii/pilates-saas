import { NextRequest, NextResponse } from 'next/server';
import { facturaDeSociaPublica, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// La factura de un recibo, para la socia a la que pertenece.
//
// Exige sesión real de socia (JWT de Supabase Auth) y la identidad sale del
// token verificado, NUNCA del body: pasar el `reciboId` de otra persona no
// devuelve su factura. Mismo contrato que `/api/public/canje`.
//
// Es de SOLO LECTURA y no emite nada: si el recibo no tiene factura, responde
// 404 y la pantalla mantiene su respaldo («pídesela al estudio»). Esa línea
// importa — la factura es un documento fiscal sellado con Veri*Factu, y lo que
// no puede hacerse desde aquí es crearla, alterarla ni re-emitirla.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-factura', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; reciboId?: string } | null;
  if (!body?.studioId || !body?.reciboId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const r = await facturaDeSociaPublica({ studioId: body.studioId, socioId, reciboId: body.reciboId });
    if ('error' in r) {
      // 'No autorizado' y 'Sin factura' se responden distinto a propósito: el
      // primero es un recibo que NO es suyo (401, sin decir si existe), el
      // segundo un recibo suyo que no tiene factura emitida (404), que es un
      // caso normal y la pantalla sabe contar.
      return r.error === 'No autorizado'
        ? NextResponse.json({ error: r.error }, { status: 401 })
        : NextResponse.json({ error: r.error }, { status: 404 });
    }
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('public/factura:POST', err, 'No se ha podido obtener la factura.');
  }
}
