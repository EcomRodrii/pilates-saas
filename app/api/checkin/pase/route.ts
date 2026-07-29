import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { checkinPublico } from '@/lib/supabase-data';
import { abrirPuertaDelEstudio, tieneKisi } from '@/lib/kisi-servidor';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarPase, codigoCortoValido, normalizarCodigo, paseVigente, ventanaDelPase } from '@/lib/pase-acceso';

// POST /api/checkin/pase → el estudio lee el pase de una clienta y la marca.
//
// Este endpoint ES la prueba de presencia. Marcar asistencia otorga créditos
// canjeables, dispara el premio de referido y mueve racha y logros, así que
// exige sesión de PERSONAL: la clienta no puede marcarse sola desde el sofá.
//
// Quién puede: cualquier persona del equipo del estudio, instructoras incluidas.
// No es una laxitud — es que hoy la instructora ya marca asistencia a mano en
// la pestaña Asistentes del calendario. Dejar el escáner en menos manos que la
// lista que sustituye habría sido incoherente.
//
// Dos formas de leerlo, mismo destino: el QR (token firmado, caduca en 2 min) o
// el código de 6 caracteres tecleado cuando la cámara no coopera.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'checkin-pase', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: string; codigo?: string } | null;
  const token = typeof body?.token === 'string' ? body.token : null;
  const codigo = typeof body?.codigo === 'string' ? normalizarCodigo(body.codigo) : null;
  if (!token && !codigo) return errorPeticion('Falta el pase', 400);

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('checkin/pase', new Error('sin service-role'), 'No hemos podido leer el pase.');

  try {
    const ahora = new Date();
    let reservaId: string | null = null;

    if (token) {
      const claim = verificarPase(token, ahora.getTime());
      if (!claim) return errorPeticion('Este pase ha caducado. Pídele que lo vuelva a abrir.', 401);
      // El estudio del token tiene que ser el de quien escanea. Sin esto, el
      // pase de otro estudio marcaría asistencia aquí.
      if (claim.studioId !== sesion.studioId) {
        return errorPeticion('Este pase no es de tu estudio.', 403);
      }
      reservaId = claim.reservaId;
    } else if (codigo) {
      // El código no dice a qué reserva pertenece: se busca entre las que están
      // en ventana AHORA MISMO en este estudio. Son las de la próxima hora y
      // pico — decenas, no miles.
      const desde = new Date(ahora.getTime() - 30 * 60_000).toISOString();
      const hasta = new Date(ahora.getTime() + 90 * 60_000).toISOString();
      const { data: filas, error } = await admin
        .from('reservas')
        .select('id, sesiones!inner(inicio, cancelada)')
        .eq('studio_id', sesion.studioId)
        .eq('estado', 'CONFIRMADA')
        .gte('sesiones.inicio', desde)
        .lte('sesiones.inicio', hasta);
      if (error) return errorInterno('checkin/pase', error, 'No hemos podido leer el pase.');
      const encontrada = (filas ?? []).find(f => codigoCortoValido(codigo, (f as { id: string }).id));
      if (!encontrada) return errorPeticion('Ese código no vale para ninguna clase de ahora.', 404);
      reservaId = (encontrada as { id: string }).id;
    }

    // Se recarga la reserva aunque el token ya la identifique: el token prueba
    // QUIÉN, no que la clase siga en pie ni a qué hora es.
    const { data: fila } = await admin
      .from('reservas')
      .select('id, estado, socio_id, sesiones!inner(inicio, cancelada, tipo_clase_id), socios!inner(nombre, apellidos)')
      .eq('id', reservaId!)
      .eq('studio_id', sesion.studioId)
      .maybeSingle();
    if (!fila) return errorPeticion('Esa reserva ya no existe.', 404);

    const datos = fila as unknown as {
      estado: string;
      sesiones: { inicio: string; cancelada: boolean; tipo_clase_id: string };
      socios: { nombre: string; apellidos: string | null };
    };
    const quien = [datos.socios.nombre, datos.socios.apellidos].filter(Boolean).join(' ');

    if (datos.sesiones.cancelada) return errorPeticion('Esa clase está cancelada.', 409);

    const inicio = new Date(datos.sesiones.inicio);
    if (!paseVigente(inicio, ahora)) {
      const { desde, hasta } = ventanaDelPase(inicio);
      const pronto = ahora < desde;
      return errorPeticion(
        pronto
          ? `El pase de ${quien} todavía no está activo (se abre a las ${desde.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}).`
          : `El pase de ${quien} ya expiró (se cerró a las ${hasta.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}). Márcala a mano desde el calendario.`,
        409,
      );
    }

    // Repetir el escaneo no es un error: la instructora vuelve a apuntar sin
    // querer y la clienta ya está dentro. checkinPublico es idempotente.
    const yaEstaba = datos.estado === 'ASISTIDA';
    const r = await checkinPublico({ studioId: sesion.studioId, reservaId: reservaId! });
    if ('error' in r) return errorPeticion(r.error ?? 'No se ha podido registrar la asistencia.', 409);

    // La puerta, después de marcar y sin bloquear. Si Kisi falla, el check-in
    // ya está hecho y la recepcionista abre a mano — al revés sería peor:
    // puerta abierta y asistencia sin registrar.
    let puerta: 'abierta' | 'fallo' | 'sin-kisi' = 'sin-kisi';
    if (await tieneKisi(sesion.studioId)) {
      const p = await abrirPuertaDelEstudio(sesion.studioId);
      puerta = p.ok ? 'abierta' : 'fallo';
      if (!p.ok) console.error('[checkin/pase] kisi', p.error);
    }

    return NextResponse.json({ ok: true, quien, yaEstaba, puerta, inicio: datos.sesiones.inicio });
  } catch (err) {
    return errorInterno('checkin/pase:POST', err, 'No hemos podido leer el pase.');
  }
}
