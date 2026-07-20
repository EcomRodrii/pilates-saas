import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado } from '@/lib/sustituciones/enlaces';
import { celdaKey, franjaPorHoraInicio } from '@/lib/sustituciones/franjas';
import { DisponibilidadForm } from './disponibilidad-form';

export const dynamic = 'force-dynamic';

// Página PÚBLICA (sin login) a la que la instructora llega por deep link firmado.
// Valida el token en servidor, carga su disponibilidad actual con service-role y
// renderiza la rejilla cliente. Enlace inválido/caducado → mensaje amable.
export default async function DisponibilidadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = verificarTokenInstructora(token, 'disponibilidad');

  if (!claim) {
    return <Aviso titulo="Enlace no válido o caducado" texto="Pide a tu estudio que te envíe un enlace nuevo." />;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return <Aviso titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;
  }

  // Se generó un enlace nuevo para esta instructora → este ha quedado revocado
  // (migración 0057). Mismo mensaje que caducado: no hace falta distinguirlos.
  if (await enlaceRevocado(admin, claim.instructorId, 'disponibilidad', token)) {
    return <Aviso titulo="Enlace no válido o caducado" texto="Pide a tu estudio que te envíe un enlace nuevo." />;
  }

  const { data: instructora } = await admin
    .from('instructores').select('nombre, studio_id')
    .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle();
  if (!instructora) {
    return <Aviso titulo="Enlace no válido" texto="No encontramos tu ficha. Pide a tu estudio un enlace nuevo." />;
  }

  const { data: estudio } = await admin
    .from('studios').select('nombre').eq('id', claim.studioId).maybeSingle();

  const { data: filas } = await admin
    .from('instructora_disponibilidad').select('dia_semana, hora_inicio')
    .eq('instructor_id', claim.instructorId);

  const celdasIniciales = (filas ?? [])
    .map((f) => {
      const franja = franjaPorHoraInicio(String(f.hora_inicio));
      return franja ? celdaKey(f.dia_semana as number, franja) : null;
    })
    .filter((c): c is string => c !== null);

  return (
    <DisponibilidadForm
      token={token}
      instructorNombre={instructora.nombre}
      estudioNombre={estudio?.nombre ?? ''}
      celdasIniciales={celdasIniciales}
    />
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{texto}</p>
      </div>
    </main>
  );
}
