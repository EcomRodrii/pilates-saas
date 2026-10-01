import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uid } from '@/lib/utils';
import { generarClaveApi } from '@/lib/api-publica/claves';
import { exigirGestorApi, clavePanel, COLUMNAS_CLAVE } from '@/lib/api-publica/gestion';
import { HORAS_SOLAPE_ROTACION, estadoClave, expiraTrasRotar, filtroClaves } from '@/lib/api-publica/gestion-reglas';

// POST: rota una clave. Crea otra con el mismo nombre y permisos (recortados a
// lo que hoy se puede dar) y deja la vieja viva HORAS_SOLAPE_ROTACION para
// cambiarla en el programa sin cortar la sincronización. Devuelve la nueva en
// claro una sola vez. Una clave de cadena sigue siéndolo, y solo la rota la
// dueña de la cadena.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-claves-rotar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.activada) return NextResponse.json({ error: 'La API no está activada para tu estudio.' }, { status: 403 });
  const { id } = await params;

  const { data: vieja } = await g.admin.from('api_claves')
    .select('id, nombre, scopes, expira_en, revocada_en, creada_en, cadena_id')
    .eq('id', id).or(filtroClaves(g)).maybeSingle();
  if (!vieja) return NextResponse.json({ error: 'Clave no encontrada' }, { status: 404 });
  // Creada aquí cuando era la dueña de la cadena, y hoy ya no lo es: puede
  // revocarla, pero no sacar otra de cadena.
  if (vieja.cadena_id && vieja.cadena_id !== g.cadenaId) {
    return NextResponse.json({ error: 'Solo la dueña de la cadena puede cambiar una clave de toda la cadena.' }, { status: 403 });
  }
  if (estadoClave(vieja, new Date()) !== 'activa') {
    return NextResponse.json({ error: 'Solo se puede rotar una clave activa.' }, { status: 409 });
  }
  const scopes = (vieja.scopes as string[]).filter((s) => (g.permitidos as string[]).includes(s));
  if (scopes.length === 0) return NextResponse.json({ error: 'Esta clave ya no tiene ningún permiso que puedas dar.' }, { status: 409 });

  // Misma duración que la original si caducaba; si no, tampoco la nueva.
  const vidaMs = vieja.expira_en ? Date.parse(vieja.expira_en) - Date.parse(vieja.creada_en) : null;
  const ahora = new Date();
  const nueva = generarClaveApi();
  const { data, error } = await g.admin.from('api_claves').insert({
    id: `apik-${uid()}`, studio_id: g.studioId, nombre: vieja.nombre, prefijo: nueva.prefijo, hash: nueva.hash,
    scopes, creada_por: g.userId, rotada_desde: vieja.id, cadena_id: vieja.cadena_id ?? null,
    expira_en: vidaMs ? new Date(ahora.getTime() + vidaMs).toISOString() : null,
  }).select(COLUMNAS_CLAVE).single();
  if (error || !data) return NextResponse.json({ error: 'No se pudo crear la clave nueva.' }, { status: 500 });

  // Si no se consigue poner caducidad a la vieja, la respuesta mentiría («deja de
  // valer en 24 h») y quedarían DOS claves vivas, la vieja quizá para siempre.
  // Se deshace la nueva y se dice.
  const { error: errVieja } = await g.admin.from('api_claves').update({ expira_en: expiraTrasRotar(ahora, vieja.expira_en) })
    .eq('id', vieja.id).or(filtroClaves(g));
  if (errVieja) {
    await g.admin.from('api_claves').update({ revocada_en: new Date().toISOString(), revocada_por: g.userId })
      .eq('id', data.id).eq('studio_id', g.studioId);
    return NextResponse.json({ error: 'No se pudo cambiar la clave. La de siempre sigue funcionando.' }, { status: 500 });
  }

  return NextResponse.json({ clave: nueva.clave, detalle: clavePanel(data), viejaCaducaEnHoras: HORAS_SOLAPE_ROTACION }, { status: 201 });
}
