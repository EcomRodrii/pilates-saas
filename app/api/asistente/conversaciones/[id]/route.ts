import { NextRequest, NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { tablaReferencias } from '@/lib/asistente/referencias';
import { asistenteEncendido, nombresDeReferencias, type SesionAsistente } from '@/lib/asistente/servidor';
import { todasLasFilas, type Pagina } from '@/lib/clientas/estado-servidor';
import type { BloqueAsistente } from '@/lib/asistente/tipos';
import { MAX_CONTEXTO_TOKENS } from '@/lib/asistente/limites';

// GET /api/asistente/conversaciones/[id] — reabrir una conversación: cada turno
// como lo vio la propietaria (su pregunta, el texto y las tarjetas), sin la
// fontanería de herramientas. Solo las SUYAS (estudio y usuario de la sesión).
// Los nombres se vuelven a resolver ahora desde los ids: una socia borrada
// sale «Clienta eliminada».

type Fila = { orden: number; rol: 'user' | 'assistant'; contenido: Anthropic.ContentBlockParam[]; bloques: BloqueAsistente[] };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeUsarAsistente(sesionStaff.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  if (!asistenteEncendido(sesionStaff.studioId)) return NextResponse.json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Conversación no válida' }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion: SesionAsistente = { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol };

  const { data: conv, error } = await admin.from('asistente_conversaciones').select('id, referencias, tokens_contexto, ultima_en')
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: 'No disponible ahora' }, { status: 503 });
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
  const mensajes = await todasLasFilas<Fila>((d, h) => admin.from('asistente_mensajes').select('orden, rol, contenido, bloques')
    .eq('studio_id', sesion.studioId).eq('conversacion_id', id).order('orden').range(d, h) as unknown as Pagina<Fila>);
  if (mensajes.error) return NextResponse.json({ error: 'No disponible ahora' }, { status: 503 });

  // Un turno = una pregunta (mensaje `user` con texto) + lo que vino hasta la siguiente.
  const turnos: { pregunta: string; texto: string; bloques: BloqueAsistente[] }[] = [];
  for (const m of mensajes.data) {
    const textos = (Array.isArray(m.contenido) ? m.contenido : []).filter((b): b is Anthropic.TextBlockParam => b.type === 'text').map(b => b.text);
    if (m.rol === 'user' && textos.length) turnos.push({ pregunta: textos.join(' '), texto: '', bloques: [] });
    const actual = turnos[turnos.length - 1];
    if (!actual) continue;
    if (m.rol === 'assistant' && textos.length) actual.texto = [actual.texto, ...textos].filter(Boolean).join(' ');
    if (Array.isArray(m.bloques)) actual.bloques.push(...m.bloques);
  }
  const refs = tablaReferencias(conv.referencias);
  const nombres = await nombresDeReferencias(admin, sesion, refs, Object.keys(refs.aJson()));
  return NextResponse.json({
    id: conv.id, ultimaEn: conv.ultima_en, turnos, referencias: nombres,
    llena: ((conv.tokens_contexto as number) ?? 0) > MAX_CONTEXTO_TOKENS,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
