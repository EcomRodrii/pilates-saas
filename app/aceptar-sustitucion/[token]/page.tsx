import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { AceptarForm } from './aceptar-form';

export const dynamic = 'force-dynamic';

const EN_JUEGO = ['buscando', 'pendiente_aprobacion', 'contactando'];

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

export default async function AceptarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verificarTokenInstructora(token, 'aceptar_sustitucion');
  if (!claim || !claim.ref) {
    return <Aviso icono="🔒" titulo="Enlace no válido o caducado" texto="Pide a tu estudio que te avise de otra forma." />;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return <Aviso icono="⏳" titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;

  const { data: sust } = await admin
    .from('sustituciones')
    .select('id, estado, sesion_id, sesiones(inicio, tipo_clase_id)')
    .eq('id', claim.ref).eq('studio_id', claim.studioId).maybeSingle();
  if (!sust) return <Aviso icono="🔒" titulo="Enlace no válido" texto="No encontramos esta sustitución." />;

  if (!EN_JUEGO.includes(sust.estado as string)) {
    return <Aviso icono="✅" titulo="Ya está cubierta" texto="Otra persona la cogió antes. ¡Gracias igualmente!" />;
  }

  const ses = (Array.isArray(sust.sesiones) ? sust.sesiones[0] : sust.sesiones) as
    { inicio: string; tipo_clase_id: string | null } | null;
  const [{ data: instructora }, { data: tipo }, { data: estudio }] = await Promise.all([
    admin.from('instructores').select('nombre').eq('id', claim.instructorId).maybeSingle(),
    admin.from('tipos_clase').select('nombre').eq('id', ses?.tipo_clase_id ?? '').maybeSingle(),
    admin.from('studios').select('nombre').eq('id', claim.studioId).maybeSingle(),
  ]);

  return (
    <AceptarForm
      token={token}
      instructorNombre={instructora?.nombre ?? ''}
      estudioNombre={estudio?.nombre ?? ''}
      claseNombre={tipo?.nombre ?? 'Clase'}
      cuando={ses?.inicio ? cuandoTexto(ses.inicio) : ''}
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
