'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/lib/auth-context';
import { ListaHilosMensajes } from '@/components/network/lista-hilos-mensajes';

// Bandeja de mensajes de la instructora (brief §9/§19) — un hilo por
// solicitud de contacto ACEPTADA, mismo componente que el lado estudio
// (app/(dashboard)/network/mensajes). En /network/mis-mensajes y no
// /network/mensajes porque ese path ya lo ocupa la bandeja del estudio
// (app/(dashboard) resuelve al mismo /network/*, Next no permite dos
// páginas para la misma URL). Misma razón que solicitudes/page.tsx: fuera
// de (dashboard), sin guard de sesión heredado.
export default function MensajesNetworkPage() {
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [hiloDesdeQuery, setHiloDesdeQuery] = useState<string | null>(null);

  // Se lee de window.location y no con useSearchParams para no suspender el
  // árbol (mismo motivo que en el resto de pantallas del panel).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHiloDesdeQuery(new URLSearchParams(window.location.search).get('hilo'));
  }, []);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link href="/network/solicitudes" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={14} /> Volver a solicitudes
      </Link>

      <PageHeader
        title="Mensajes"
        description="Conversaciones con estudios que han aceptado tu contacto."
      />

      {cargandoSesion || !user ? null : (
        <ListaHilosMensajes vacioTexto="Todavía no tienes ninguna conversación." abrirSolicitudId={hiloDesdeQuery} />
      )}
    </div>
  );
}
