import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buscarArticulos } from '@/lib/ayuda/busqueda';
import { anonimizarTermino } from '@/lib/ayuda/busquedas-sin-resultado';

// «Esto se buscó y no se encontró»: lo avisa el buscador del Centro de ayuda y de Academy cuando una búsqueda se queda sin resultados.
// Público y anónimo (nadie ha iniciado sesión). Lo que se guarda es SOLO el término, ya anonimizado, y cuántas veces
// (`ayuda_busquedas`, 90 días): ni usuario, ni estudio, ni IP. Ver lib/ayuda/busquedas-sin-resultado.ts para lo que se descarta.
//
// El servidor vuelve a comprobar que el término de verdad no da resultados: si no, cualquiera podría llenar la tabla con búsquedas
// que sí se encuentran y tapar las que importan.
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'ayuda-busqueda', { max: 20, windowSeconds: 60 });
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as { termino?: unknown } | null;
  const termino = anonimizarTermino(body?.termino);
  // Un término que no se debe guardar no es un error de quien llama: se dice que no se guardó y ya.
  if (!termino) return NextResponse.json({ ok: true, guardada: false });
  if (buscarArticulos(termino).length > 0) return NextResponse.json({ ok: true, guardada: false });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { error } = await db.rpc('registrar_busqueda_sin_resultado', { p_termino: termino });
  if (error) {
    // Antes de aplicar la migración la función no existe: no es algo que avisar a nadie, y quien busca no lo nota.
    if (error.code !== 'PGRST202' && error.code !== '42883') console.error('[ayuda/busqueda]', error.code);
    return NextResponse.json({ error: 'No se ha podido guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, guardada: true });
}
