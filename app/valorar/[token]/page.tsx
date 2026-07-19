import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarTokenValoracion } from '@/lib/valoraciones/token';
import { ValorarForm } from './valorar-form';

export const dynamic = 'force-dynamic';

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

export default async function ValorarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verificarTokenValoracion(token);
  if (!claim) {
    return <Aviso icono="🔒" titulo="Enlace no válido o caducado" texto="Pídele a tu estudio que te lo reenvíe." />;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return <Aviso icono="⏳" titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;

  const { data: ses } = await admin
    .from('sesiones').select('inicio, tipo_clase_id, instructor_id, cancelada')
    .eq('id', claim.sesionId).eq('studio_id', claim.studioId).maybeSingle();
  if (!ses) return <Aviso icono="🔒" titulo="Enlace no válido" texto="No encontramos esta clase." />;

  const [{ data: instructora }, { data: tipo }, { data: estudio }, { data: previa }] = await Promise.all([
    admin.from('instructores').select('nombre').eq('id', ses.instructor_id ?? '').maybeSingle(),
    admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id ?? '').maybeSingle(),
    admin.from('studios').select('nombre').eq('id', claim.studioId).maybeSingle(),
    admin.from('valoraciones').select('id').eq('socio_id', claim.socioId).eq('sesion_id', claim.sesionId).maybeSingle(),
  ]);

  return (
    <ValorarForm
      token={token}
      instructorNombre={instructora?.nombre ?? ''}
      estudioNombre={estudio?.nombre ?? ''}
      claseNombre={tipo?.nombre ?? 'Clase'}
      cuando={ses.inicio ? cuandoTexto(ses.inicio) : ''}
      yaValorada={!!previa}
    />
  );
}

function Aviso({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-3">{icono}</div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{texto}</p>
      </div>
    </main>
  );
}
