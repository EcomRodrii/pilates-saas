import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { estudioDeSlug } from '@/lib/regalo/estudio-publico';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { captchaDeServidorListo } from '@/lib/auth/captcha-servidor';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';

export const dynamic = 'force-dynamic';

// Lo que la página pública de compra necesita para pintarse. Sin PII, y «a la venta»
// solo si TODO lo que hace falta para cobrar está listo: ajustes encendidos, cuenta de
// cobro del estudio y captcha de servidor. Una página que enseña un formulario que va a
// fallar es peor que no enseñarlo.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-regalo-info', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const estudio = await estudioDeSlug(admin, req.nextUrl.searchParams.get('slug'));
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const cerrada = await paginaCerradaParaPeticion(req, estudio.id);
  if (cerrada) return cerrada;
  const { ajustes: a } = estudio;
  const aLaVenta = a.activo && !!estudio.stripeAccountId && comprobarModoStripe().puedeCobrar && captchaDeServidorListo();
  return NextResponse.json({
    nombreEstudio: estudio.nombre, aLaVenta,
    importesEur: a.importesEur, permiteImporteLibre: a.permiteImporteLibre,
    importeMinEur: a.importeMinEur, importeMaxEur: a.importeMaxEur, caducidadMeses: a.caducidadMeses, terminos: a.terminos,
  });
}
