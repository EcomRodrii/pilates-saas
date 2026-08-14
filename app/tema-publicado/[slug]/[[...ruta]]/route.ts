import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { servirFicheroTema, type FilaTemaImportado } from '@/lib/theme-import/servir';
import { hostAutorizado } from '@/lib/theme-import/host-autorizado';

export const runtime = 'nodejs';

// GET imports.tentare.app/<slug>/[...ruta] — el tema ZIP PUBLICADO de un
// estudio, servido de verdad, sin iframe ni token.
//
// ⚠️ SEGURIDAD — por qué esto vive en un origen aparte y no en tentare.app:
// el HTML/CSS/JS de un tema importado es, en esencia, código de terceros (lo
// exportó Claude Design, o lo editó la propietaria a mano) — no confiamos en
// él más de lo que confiaríamos en cualquier script ajeno. Servirlo bajo
// `tentare.app` lo pondría bajo el origen de confianza del panel aunque no
// hubiera ningún fallo de sandboxing de por medio. Un origen DISTINTO
// (`imports.tentare.app`) es aislamiento real por el propio modelo del
// navegador: su JS nunca puede leer `localStorage`/hacer una petición
// autenticada contra `tentare.app` sin que el navegador la trate como
// cross-site — sin depender de ningún atributo de iframe.
//
// La cerradura real NO es el rewrite de `next.config.ts` (eso es solo azúcar
// de URL: cualquier Route Handler es alcanzable igual desde los dos
// dominios, Next no mira `Host` al enrutar) — es `hostAutorizado()`
// (`lib/theme-import/host-autorizado.ts`, testeada aparte). Si algún día esta
// comprobación se mueve a un proxy/rewrite y se pierde por el camino, el
// tema volvería a poder servirse bajo `tentare.app` sin que nada avise — por
// eso vive aquí dentro, no fuera.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; ruta?: string[] }> },
) {
  const autorizado = hostAutorizado(req.headers.get('host'), {
    esProduccion: process.env.NODE_ENV === 'production',
    hostEsperado: process.env.NEXT_PUBLIC_IMPORTS_HOST,
  });
  if (!autorizado) {
    return new NextResponse('No encontrado', { status: 404 });
  }

  const { slug, ruta } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return new NextResponse('Servicio no disponible', { status: 503 });

  const { data: estudio } = await admin.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (!estudio) return new NextResponse('No encontrado', { status: 404 });

  // Solo el publicado — nunca se lista ni se expone ningún otro ZIP subido
  // de este estudio a un visitante anónimo, publicado o no es la única
  // pregunta que esta ruta puede responder.
  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, storage_prefix, entry_html, estado, manifest')
    .eq('studio_id', estudio.id)
    .eq('publicado', true)
    .maybeSingle<FilaTemaImportado>();
  if (!fila) return new NextResponse('Este estudio no tiene ningún tema publicado.', { status: 404 });

  const rutaPedida = ruta && ruta.length > 0 ? ruta.join('/') : null;
  return servirFicheroTema(
    admin, fila, rutaPedida,
    (rutaResuelta) => `/tema-publicado/${slug}/${rutaResuelta}`,
  );
}
