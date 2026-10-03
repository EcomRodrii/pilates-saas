import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { clavesIbanDelEntorno, descifrarIban } from '@/lib/billing/iban-cifrado';

// Los IBAN de los mandatos VIGENTES, en claro, para montar el fichero de la
// remesa (components/cobros/boton-remesa-sepa.tsx). Es el ÚNICO sitio por el
// que un IBAN entero sale de la base de datos, y solo al generar la remesa: el
// panel, el resto del tiempo, solo conoce los 4 últimos dígitos.
//
// Todo o nada: si uno no se descifra, no se devuelve ninguno. Una lista a la
// que le faltara un mandato dejaría su recibo fuera de la remesa diciendo «sin
// domiciliar», que es mentira.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'mandatos-sepa-remesa', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para generar remesas' }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data, error } = await admin.from('mandatos_sepa')
    .select('id, socio_id, iban, ref_mandato, fecha_firma')
    .eq('studio_id', sesion.studioId).eq('estado', 'VIGENTE').order('id');
  if (error) return errorInterno('cobros/mandatos-sepa/remesa', error, 'No se han podido leer las domiciliaciones.');

  const claves = clavesIbanDelEntorno();
  const mandatos: { socioId: string; iban: string; refMandato: string; fechaFirma: string }[] = [];
  for (const m of data ?? []) {
    const iban = descifrarIban(m.iban as string, sesion.studioId, m.id as string, claves);
    if (!iban) {
      return errorInterno('cobros/mandatos-sepa/remesa:descifrar', new Error(`mandato ${m.id as string} ilegible`),
        'No se ha podido leer el IBAN de una domiciliación. Avísanos y no generes la remesa todavía.');
    }
    mandatos.push({ socioId: m.socio_id as string, iban, refMandato: m.ref_mandato as string, fechaFirma: m.fecha_firma as string });
  }
  return NextResponse.json({ mandatos }, { headers: { 'Cache-Control': 'no-store' } });
}
