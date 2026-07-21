import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarTokenConfirmacion } from '@/lib/confirmacion-riesgo/token';
import { ConfirmarReservaForm } from './confirmar-reserva-form';

export const dynamic = 'force-dynamic';

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

// Página PÚBLICA (sin login) a la que la socia llega por deep link firmado
// para confirmar que viene a su clase (riesgo de plantón, opción 2). Valida el
// token en servidor y carga los datos con service-role; la confirmación en sí
// la hace el formulario cliente contra /api/public/confirmacion-reserva.
export default async function ConfirmarReservaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = verificarTokenConfirmacion(token);
  if (!claim) {
    return <Aviso icono="🔒" titulo="Enlace no válido o caducado" texto="Pídele a tu estudio que te lo reenvíe." />;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return <Aviso icono="⏳" titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;

  const { data: reserva } = await admin
    .from('reservas').select('estado, socio_id, sesion_id, confirmado_en')
    .eq('id', claim.reservaId).eq('studio_id', claim.studioId).maybeSingle();
  if (!reserva || reserva.socio_id !== claim.socioId) {
    return <Aviso icono="🔒" titulo="Enlace no válido" texto="No encontramos esta reserva." />;
  }

  const [{ data: socia }, { data: ses }, { data: estudio }] = await Promise.all([
    admin.from('socios').select('nombre').eq('id', claim.socioId).maybeSingle(),
    admin.from('sesiones').select('inicio, tipo_clase_id').eq('id', reserva.sesion_id).maybeSingle(),
    admin.from('studios').select('nombre').eq('id', claim.studioId).maybeSingle(),
  ]);
  const { data: tipo } = ses?.tipo_clase_id
    ? await admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle()
    : { data: null };

  if (reserva.estado !== 'CONFIRMADA') {
    return (
      <Aviso icono="🗓️" titulo="Esta plaza ya no está en pie"
        texto="No llegamos a tiempo con tu confirmación, o la reserva se resolvió de otra forma. Si quieres, reserva otra clase desde el portal de tu estudio." />
    );
  }

  return (
    <ConfirmarReservaForm
      token={token}
      socioNombre={socia?.nombre ?? ''}
      estudioNombre={estudio?.nombre ?? ''}
      claseNombre={tipo?.nombre ?? 'Clase'}
      cuando={ses?.inicio ? cuandoTexto(ses.inicio as string) : ''}
      yaConfirmado={!!reserva.confirmado_en}
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
