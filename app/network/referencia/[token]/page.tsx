import { CheckCircle2, Hourglass, Lock, PartyPopper, ThumbsUp, type LucideIcon } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { IconoDesenlace } from '@/components/publico/icono-desenlace';
import { ReferenciaForm } from './referencia-form';

export const dynamic = 'force-dynamic';

function referenciaCaducada(tokenExpiraEn: string): boolean {
  return new Date(tokenExpiraEn).getTime() <= Date.now();
}

// Página PÚBLICA (sin login): el referente de una referencia profesional de
// Tentare Network confirma/rechaza desde el enlace del email. Mismo patrón
// que app/aceptar-sustitucion/[token] — un Server Component hace la lectura
// inicial con service-role (la RLS de red_referencias no da SELECT a
// `anon`, a propósito) y decide qué pantalla mostrar; el formulario en sí es
// un Client Component que llama a /api/public/network/referencia.
export default async function ReferenciaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = getSupabaseAdmin();
  if (!admin) return <Aviso icono={Hourglass} titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;

  const { data: referencia } = await admin
    .from('red_referencias')
    .select('id, perfil_id, nombre_referente, relacion, estado, token_expira_en')
    .eq('token', token)
    .maybeSingle();
  if (!referencia) return <Aviso icono={Lock} titulo="Enlace no válido" texto="No encontramos esta solicitud de referencia." />;

  if (referencia.estado === 'confirmada') {
    return <Aviso icono={PartyPopper} tono="exito" titulo="Ya la confirmaste" texto="Gracias, tu respuesta ya quedó registrada." />;
  }
  if (referencia.estado === 'rechazada') {
    return <Aviso icono={ThumbsUp} titulo="Ya respondiste" texto="Nos dijiste que no podías confirmar esta referencia. Gracias por avisar." />;
  }
  if (referencia.estado === 'expirada' || referenciaCaducada(referencia.token_expira_en as string)) {
    return <Aviso icono={CheckCircle2} titulo="Este enlace ha caducado" texto="Pide a la profesional que te envíe la solicitud de nuevo si sigue interesándole." />;
  }

  const { data: perfil } = await admin.from('red_perfiles').select('nombre').eq('id', referencia.perfil_id).maybeSingle();

  return (
    <ReferenciaForm
      token={token}
      nombreReferente={referencia.nombre_referente as string}
      profesionalNombre={(perfil?.nombre as string | undefined) ?? 'esta profesional'}
      relacion={(referencia.relacion as string | null) ?? null}
    />
  );
}

function Aviso({ icono, tono, titulo, texto }: { icono: LucideIcon; tono?: 'exito' | 'neutro'; titulo: string; texto: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <IconoDesenlace icono={icono} tono={tono} />
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{texto}</p>
      </div>
    </main>
  );
}
