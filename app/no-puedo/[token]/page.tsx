import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { BajaForm } from './baja-form';

export const dynamic = 'force-dynamic';

// Página PÚBLICA (sin login) a la que la instructora llega por deep link firmado
// para avisar de que no puede dar una clase. Valida el token en servidor; las
// clases las carga el formulario contra /api/public/baja (misma fuente que usa
// para refrescar tras avisar → una sola forma de leerlas, sin duplicar la query).
export default async function NoPuedoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = verificarTokenInstructora(token, 'reportar_baja');

  if (!claim) {
    return <Aviso titulo="Enlace no válido o caducado" texto="Pide a tu estudio que te envíe un enlace nuevo." />;
  }

  return <BajaForm token={token} />;
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
