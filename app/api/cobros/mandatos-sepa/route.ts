import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { validarIBAN } from '@/lib/sepa-19-14';
import { cifrarIban, clavesIbanDelEntorno, ultimos4 } from '@/lib/billing/iban-cifrado';
import { uid } from '@/lib/utils';

// Mandatos SEPA (cuaderno 19.14): el IBAN entra por aquí y se guarda CIFRADO
// (lib/billing/iban-cifrado.ts). Desde el 2-oct-2026 el navegador ya no escribe
// en `mandatos_sepa` (migr 20261003020100): sin clave en el servidor no hay
// forma de guardar un IBAN en claro.
//
// Mismo permiso que la RLS que había: `puedeMoverDinero` (propietaria y recepción).

const COLUMNAS = 'id, studio_id, socio_id, iban_ultimos4, ref_mandato, fecha_firma, estado, creada_en';

async function guardia(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'mandatos-sepa', { max: 30, windowSeconds: 60 });
  if (limited) return { error: limited };
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!puedeMoverDinero(sesion.rol)) {
    return { error: NextResponse.json({ error: 'No tienes permiso para gestionar domiciliaciones' }, { status: 403 }) };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

/** Pone (o cambia) el mandato vigente de una clienta. Uno vigente por clienta. */
export async function POST(req: NextRequest) {
  const g = await guardia(req);
  if ('error' in g) return g.error;
  const { sesion, admin } = g;
  const body = await req.json().catch(() => null) as { socioId?: unknown; iban?: unknown; refMandato?: unknown; fechaFirma?: unknown } | null;
  const socioId = typeof body?.socioId === 'string' ? body.socioId : '';
  const iban = typeof body?.iban === 'string' ? body.iban : '';
  const refMandato = typeof body?.refMandato === 'string' ? body.refMandato.trim() : '';
  const fechaFirma = typeof body?.fechaFirma === 'string' ? body.fechaFirma.slice(0, 10) : '';
  if (!socioId) return NextResponse.json({ error: 'Falta la clienta' }, { status: 400 });
  // Sin IBAN solo se puede EDITAR un mandato que ya existe: se conserva el cifrado.
  const conservaIban = iban.trim() === '';
  if (!conservaIban && !validarIBAN(iban)) return NextResponse.json({ error: 'IBAN no válido.' }, { status: 400 });
  // El cuaderno 19.14 admite 35 caracteres de referencia.
  if (!refMandato || refMandato.length > 35) return NextResponse.json({ error: 'La referencia del mandato tiene que tener entre 1 y 35 caracteres.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFirma)) return NextResponse.json({ error: 'Falta la fecha de firma.' }, { status: 400 });

  try {
    const [{ data: socia, error: eSocia }, { data: vigente, error: eVigente }] = await Promise.all([
      admin.from('socios').select('id').eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null).maybeSingle(),
      admin.from('mandatos_sepa').select('id').eq('studio_id', sesion.studioId).eq('socio_id', socioId).eq('estado', 'VIGENTE').maybeSingle(),
    ]);
    if (eSocia || eVigente) throw eSocia ?? eVigente;
    if (!socia) return NextResponse.json({ error: 'No encontramos a esta clienta en tu estudio.' }, { status: 404 });

    if (conservaIban) {
      if (!vigente) return NextResponse.json({ error: 'IBAN no válido.' }, { status: 400 });
      const { data, error } = await admin.from('mandatos_sepa').update({ ref_mandato: refMandato, fecha_firma: fechaFirma })
        .eq('id', vigente.id as string).eq('studio_id', sesion.studioId).select(COLUMNAS).single();
      if (error || !data) throw error ?? new Error('sin fila');
      return NextResponse.json({ mandato: data });
    }

    // Se reutiliza el id del vigente: así el índice de «uno vigente por clienta» no salta al cambiar el IBAN.
    const id = (vigente?.id as string | undefined) ?? `mnd-${uid()}`;
    const cifrado = cifrarIban(iban, sesion.studioId, id, clavesIbanDelEntorno());
    if (!cifrado) {
      return NextResponse.json({ error: 'Las domiciliaciones aún no están disponibles: falta configurar el cifrado de los IBAN.' }, { status: 503 });
    }
    const { data, error } = await admin.from('mandatos_sepa').upsert({
      id, studio_id: sesion.studioId, socio_id: socioId, iban: cifrado, iban_ultimos4: ultimos4(iban),
      ref_mandato: refMandato, fecha_firma: fechaFirma, estado: 'VIGENTE',
    }, { onConflict: 'id' }).select(COLUMNAS).single();
    if (error || !data) throw error ?? new Error('sin fila');
    return NextResponse.json({ mandato: data });
  } catch (e) {
    return errorInterno('cobros/mandatos-sepa:POST', e, 'No se ha podido guardar el mandato.');
  }
}

/** Cancela un mandato. */
export async function PATCH(req: NextRequest) {
  const g = await guardia(req);
  if ('error' in g) return g.error;
  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Falta el mandato' }, { status: 400 });
  const { data, error } = await g.admin.from('mandatos_sepa').update({ estado: 'CANCELADO' })
    .eq('id', id).eq('studio_id', g.sesion.studioId).select('id');
  if (error) return errorInterno('cobros/mandatos-sepa:PATCH', error, 'No se ha podido cancelar el mandato.');
  if (!data?.length) return NextResponse.json({ error: 'No encontramos ese mandato en tu estudio.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
