import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { ibanEnmascarado, puedeCambiarCuentaDeCobro, validarDatosSepa } from '@/lib/billing/cuenta-cobro';
import { uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Datos SEPA del estudio (Configuración → Cobros): identificador de acreedor,
// IBAN y titular con los que se genera la remesa del cuaderno 19.14.
//
// Antes los guardaba el navegador con un UPDATE directo de `studios`. Ahora esas
// columnas no son escribibles por `authenticated` (migr 20260913160100): el IBAN
// es la cuenta donde entra el dinero de las domiciliaciones y solo lo cambia la
// dueña. Se valida aquí (dígitos de control del IBAN y del identificador de
// acreedor) porque un error de copia no falla al guardar, falla en el banco con
// la remesa entera rechazada.
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // El estudio de la sesión, nunca del body.
  const { data: studio, error: errLeer } = await admin
    .from('studios').select('id, owner_auth_user_id, sepa_acreedor_id, sepa_iban, sepa_titular')
    .eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !studio) {
    return errorInterno('estudio:sepa:leer', errLeer ?? new Error('sin estudio'),
      'No se ha podido leer tu estudio. Inténtalo de nuevo en unos segundos.');
  }

  const esDuena = studio.owner_auth_user_id === sesion.userId;
  if (!puedeCambiarCuentaDeCobro({ rol: sesion.rol, esDuena })) {
    return NextResponse.json(
      { error: 'Solo la dueña del estudio puede cambiar la cuenta donde se cobra la remesa.' },
      { status: 403 },
    );
  }

  const validado = validarDatosSepa(await req.json().catch(() => null));
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });
  const { datos } = validado;

  const sinCambios = datos.sepaAcreedorId === studio.sepa_acreedor_id
    && datos.sepaIban === studio.sepa_iban
    && datos.sepaTitular === studio.sepa_titular;
  if (sinCambios) return NextResponse.json({ ok: true, datos, sinCambios: true });

  const { error: errUpd } = await admin
    .from('studios')
    .update({ sepa_acreedor_id: datos.sepaAcreedorId, sepa_iban: datos.sepaIban, sepa_titular: datos.sepaTitular })
    .eq('id', studio.id);
  if (errUpd) {
    return errorInterno('estudio:sepa:actualizar', errUpd,
      'No se han podido guardar los datos SEPA. Vuelve a intentarlo.');
  }

  // Constancia en Actividad, con el IBAN enmascarado. Si falla, no se deshace
  // el cambio: ya está guardado.
  const { error: errLog } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: studio.id, tipo: 'CUENTA_COBRO_CAMBIADA',
    texto: `Datos SEPA de la remesa actualizados (${ibanEnmascarado(datos.sepaIban)})`,
    socio_id: null, enlace: '/configuracion', creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (errLog) console.error('[estudio:sepa] no se pudo registrar la actividad', errLog.message);

  return NextResponse.json({ ok: true, datos });
}
