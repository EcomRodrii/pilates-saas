import { CheckCircle2, Hourglass, Lock, PartyPopper, ThumbsUp, type LucideIcon } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { ultimaRespuestaDe, type ContactoFila } from '@/lib/sustituciones/traza';
import { IconoDesenlace } from '@/components/publico/icono-desenlace';
import { AceptarForm } from './aceptar-form';
import { fechaLargaEstudio, horaEstudio } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const EN_JUEGO = ['buscando', 'pendiente_aprobacion', 'contactando'];

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = fechaLargaEstudio(d);
  const hora = horaEstudio(d);
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

export default async function AceptarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verificarTokenInstructora(token, 'aceptar_sustitucion');
  if (!claim || !claim.ref) {
    return <Aviso icono={Lock} titulo="Enlace no válido o caducado" texto="Pide a tu estudio que te avise de otra forma." />;
  }

  const admin = getSupabaseAdmin();
  if (!admin) return <Aviso icono={Hourglass} titulo="No disponible ahora mismo" texto="Inténtalo de nuevo en unos minutos." />;

  const { data: sust } = await admin
    .from('sustituciones')
    .select('id, estado, sesion_id, sesiones(inicio, tipo_clase_id)')
    .eq('id', claim.ref).eq('studio_id', claim.studioId).maybeSingle();
  if (!sust) return <Aviso icono={Lock} titulo="Enlace no válido" texto="No encontramos esta sustitución." />;

  // Antes que nada: ¿ya contestó ESTA instructora? Va delante del estado de la
  // sustitución porque ninguno de los dos casos se ve bien desde ahí — quien
  // dijo que no seguía viendo "¿puedes cubrir esta clase?" (la sustitución
  // sigue en 'contactando' con la siguiente candidata) y quien dijo que sí
  // veía "otra persona la cogió antes", que era ella misma.
  const { data: contactos } = await admin
    .from('sustitucion_contactos')
    .select('instructor_id, canal, estado, enviado_en, respondido_en')
    .eq('sustitucion_id', claim.ref)
    .eq('studio_id', claim.studioId)
    .eq('instructor_id', claim.instructorId);
  const respondida = ultimaRespuestaDe((contactos ?? []) as ContactoFila[]);
  if (respondida === 'rechazado') {
    return <Aviso icono={ThumbsUp} titulo="Ya nos contestaste"
      texto="Nos dijiste que esta no podías cubrirla. Estamos buscando a otra persona — no tienes que hacer nada más." />;
  }
  if (respondida === 'aceptado') {
    return <Aviso icono={PartyPopper} tono="exito" titulo="Esta clase ya es tuya"
      texto="Confirmaste que la cubres. La tienes en tu calendario." />;
  }

  if (!EN_JUEGO.includes(sust.estado as string)) {
    return <Aviso icono={CheckCircle2} titulo="Ya está cubierta" texto="Otra persona la cogió antes. ¡Gracias igualmente!" />;
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
