import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { devolverBonoServidor } from '@/lib/db/supabase-data-admin';

export const dynamic = 'force-dynamic';

// Auditoría 22ª pasada (3-sep-2026), F-1. Cancelar una clase devolvía la sesión
// al bono de cada socia llamando a `devolver_sesion_bono` DIRECTO desde el
// navegador (`dbDevolverSesionBono`). Esa RPC exige `puede_gestionar_calendario()`
// desde el 2-sep (P-3), y ese predicado deja fuera a INSTRUCTOR — pero el botón
// "Cancelar" del panel de sesión SÍ se le ofrece a la instructora en su propia
// clase (`esPropiaClase`, app/(dashboard)/calendario/page.tsx), y la RLS de
// `sesiones`/`reservas` se lo permite. Resultado: la instructora cancelaba, las
// socias perdían su plaza, y CADA devolución de bono reventaba con
// NO_AUTORIZADO. El único aviso lo veía ella, que es justo quien no puede
// arreglarlo (tocar `suscripciones` exige `puede_mover_dinero()`).
//
// El arreglo es el mismo que cerró P-1 el 2-sep: la escritura sale del
// navegador. El estudio se resuelve SIEMPRE de la sesión de staff, nunca del
// cuerpo, y quien devuelve es `devolverBonoServidor` — la misma función que ya
// usan los caminos de servidor (cancelación individual, sustituciones y el cron
// de mínimo de asistentes), en vez de una copia paralela en el navegador.
//
// La política del estudio (`cancelacion_clase_devuelve_bono`) se comprueba
// también AQUÍ, no solo en el navegador: es una decisión de la propietaria y no
// puede depender de que quien llame se acuerde de mirarla.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json().catch(() => null) as { reservaIds?: unknown } | null;
  const reservaIds = Array.isArray(body?.reservaIds)
    ? [...new Set(body.reservaIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
    : [];
  if (reservaIds.length === 0) return NextResponse.json({ error: 'Falta reservaIds' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // ⚠️ Los `error` de estas dos lecturas se COMPRUEBAN. Descartarlos convertía
  // este endpoint en la misma clase de éxito falso que va a cerrar: una lectura
  // fallida daba `canceladas = []` → 200 con `fallos: 0` → el panel decía
  // "clientas avisadas" y ninguna socia recuperaba su sesión.
  const { data: reservas, error: errReservas } = await admin
    .from('reservas').select('id, socio_id, sesion_id, estado')
    .in('id', reservaIds).eq('studio_id', sesion.studioId);
  if (errReservas) {
    console.error('[devolver-bonos] no se pudieron leer las reservas', errReservas.message);
    return NextResponse.json({ error: 'No se ha podido devolver el bono. Vuelve a intentarlo.' }, { status: 500 });
  }
  // Tres filtros, y los tres importan:
  //  · `CANCELADA` — la devolución es el remate de una cancelación.
  //  · NO `res-pf-` — las plazas fijas las inserta `materializar_plazas_fijas`
  //    ya CONFIRMADAS y SIN consumir bono, así que devolverles una sesión
  //    inventa saldo. El camino canónico (`ejecutarCancelacionReserva`) ya
  //    tiene este guard; aquí faltaba, y es justo el sitio donde por fin se
  //    tienen los `reservaId` en la mano para poder aplicarlo.
  //  · sesión `cancelada` — ata la devolución a una cancelación de CLASE real,
  //    que es lo único que este endpoint sirve. Sin esto, un POST con ids de
  //    reservas canceladas hace meses sube el saldo de una socia hasta el tope
  //    del plan, tantas veces como se llame.
  const candidatas = (reservas ?? []).filter(r => r.estado === 'CANCELADA' && !(r.id as string).startsWith('res-pf-'));
  if (candidatas.length === 0) return NextResponse.json({ devueltas: 0, fallos: 0, saldos: [] });

  const sesionIds = [...new Set(candidatas.map(r => r.sesion_id as string))];
  const { data: sesiones, error: errSesiones } = await admin
    .from('sesiones').select('id, instructor_id, tipo_clase_id, cancelada')
    .in('id', sesionIds).eq('studio_id', sesion.studioId);
  if (errSesiones) {
    console.error('[devolver-bonos] no se pudieron leer las sesiones', errSesiones.message);
    return NextResponse.json({ error: 'No se ha podido devolver el bono. Vuelve a intentarlo.' }, { status: 500 });
  }
  // Sin la sesión no se puede resolver el tipo de clase, y sin el tipo
  // `bonoDevolvible` elige el bono que caduque antes: con dos bonos vivos eso
  // regala saldo en uno y lo deja perdido en el otro. Así que faltar una sesión
  // NO es "seguir sin tipo": es un fallo.
  if ((sesiones ?? []).length !== sesionIds.length) {
    console.error('[devolver-bonos] faltan sesiones', { sesionIds, encontradas: (sesiones ?? []).length });
    return NextResponse.json({ error: 'No se ha podido devolver el bono. Vuelve a intentarlo.' }, { status: 500 });
  }
  const canceladasEnBD = new Set((sesiones ?? []).filter(s => s.cancelada === true).map(s => s.id as string));
  const canceladas = candidatas.filter(r => canceladasEnBD.has(r.sesion_id as string));
  if (canceladas.length === 0) return NextResponse.json({ devueltas: 0, fallos: 0, saldos: [] });

  if (!puedeGestionarCalendario(sesion.rol)) {
    if (sesion.rol !== 'INSTRUCTOR') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    // Misma comprobación que `/api/reservas/cancelar`: con service-role
    // `auth.uid()` es NULL, así que la guardia de la RPC quedaría bypaseada en
    // silencio y hay que replicarla aquí. `limit(1)` en vez de `maybeSingle()`
    // porque no hay UNIQUE(auth_user_id, studio_id) en `instructores`.
    const { data: instructorRows } = await admin
      .from('instructores').select('id')
      .eq('auth_user_id', sesion.userId).eq('studio_id', sesion.studioId)
      .neq('activo', false).order('id', { ascending: true }).limit(1);
    const instructorId = (instructorRows?.[0]?.id as string | undefined) ?? null;
    const todasSuyas = (sesiones ?? []).length === sesionIds.length
      && (sesiones ?? []).every(s => s.instructor_id === instructorId);
    if (!instructorId || !todasSuyas) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // ⚠️ La política del estudio se comprueba AQUÍ, no solo en el navegador. Su
  // gemelo de servidor (`devolverBonosPorCancelacionClase`) ya la leía en
  // servidor; dejarla solo en el cliente significaba que un POST directo con
  // JWT de staff devolvía bonos que la propietaria decidió no devolver.
  const { data: politica } = await admin
    .from('studios').select('cancelacion_clase_devuelve_bono').eq('id', sesion.studioId).maybeSingle();
  if ((politica?.cancelacion_clase_devuelve_bono ?? true) !== true) {
    return NextResponse.json({ devueltas: 0, fallos: 0, saldos: [], politica: 'no_devuelve' });
  }

  // Una devolución POR RESERVA cancelada, no por socia: quien tenía dos plazas
  // en la serie que se cancela recupera dos sesiones. Secuencial a propósito —
  // `devolver_sesion_bono` es un incremento atómico con tope en el WHERE, y en
  // paralelo dos incrementos de la misma socia compiten por la misma fila.
  const tipoPorSesion = new Map((sesiones ?? []).map(s => [s.id as string, (s.tipo_clase_id as string | null) ?? null]));
  let devueltas = 0;
  let fallos = 0;
  for (const r of canceladas) {
    const res = await devolverBonoServidor(
      admin, sesion.studioId, r.socio_id as string, tipoPorSesion.get(r.sesion_id as string) ?? null,
    );
    if (res === 'DEVUELTA') devueltas++;
    // `SIN_BONO` no cuenta como fallo: la socia pagó suelta o su bono ya está al
    // tope. Contarlo mandaría a la propietaria a "revisarlo a mano" en la mitad
    // de las cancelaciones normales.
    else if (res === 'FALLO') fallos++;
  }

  // Saldos frescos para que el panel los pinte sin recargar: el navegador ya no
  // hace la escritura, así que no puede calcularlos por su cuenta.
  const socioIds = [...new Set(canceladas.map(r => r.socio_id as string))];
  const { data: sus } = await admin
    .from('suscripciones').select('id, sesiones_restantes')
    .eq('studio_id', sesion.studioId).in('socio_id', socioIds);

  return NextResponse.json({
    devueltas,
    fallos,
    saldos: (sus ?? []).map(s => ({ suscripcionId: s.id as string, sesionesRestantes: s.sesiones_restantes as number })),
  });
}
