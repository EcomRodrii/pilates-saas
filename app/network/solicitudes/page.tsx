'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X, Loader2, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import {
  fetchSolicitudesContactoNetwork, resolverSolicitudContactoNetwork, type SolicitudContactoRecibida,
} from '@/lib/api-client';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { cn } from '@/lib/utils';

const ESTADO_INFO: Record<SolicitudContactoRecibida['estado'], { texto: string; cls: string }> = {
  pendiente: { texto: 'Pendiente', cls: 'text-amber-600' },
  aceptada: { texto: 'Aceptada', cls: 'text-success' },
  rechazada: { texto: 'Rechazada', cls: 'text-muted-foreground' },
};

// Solicitudes de contacto recibidas — docs/NETWORK-IMPLEMENTATION-PLAN.md
// §9/§11. La profesional decide caso a caso; aceptar revela su email/
// teléfono de contacto SOLO a ese estudio (nunca en esta pantalla ni en
// ninguna otra — la revelación va en el envío de la notificación).
export default function SolicitudesNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [solicitudes, setSolicitudes] = useState<SolicitudContactoRecibida[]>([]);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  // Misma razón que app/network/mi-perfil/page.tsx: fuera de (dashboard), sin
  // guard de sesión heredado.
  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/unirse');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchSolicitudesContactoNetwork().then(r => { if (vivo) { setSolicitudes(r); setCargando(false); } });
    return () => { vivo = false; };
  }, [user]);

  async function resolver(id: string, aceptar: boolean) {
    setResolviendoId(id);
    const res = await resolverSolicitudContactoNetwork(id, aceptar);
    setResolviendoId(null);
    if (!res.ok) { showToast(res.error ?? 'No se ha podido resolver'); return; }
    setSolicitudes(prev => prev.map(s => (
      s.id === id ? { ...s, estado: aceptar ? 'aceptada' : 'rechazada', resueltoEn: new Date().toISOString() } : s
    )));
    showToast(aceptar ? 'Solicitud aceptada' : 'Solicitud rechazada');
  }

  const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente');

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Solicitudes de contacto"
          description="Estudios que han visto tu perfil en Tentare Network y quieren hablar contigo."
        />
        <Link
          href="/network/mis-mensajes"
          className="shrink-0 px-3 py-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-foreground"
        >
          Mensajes
        </Link>
      </div>

      {cargandoSesion || !user || cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">Todavía no has recibido ninguna solicitud.</p>
          <Link href="/network/mi-perfil" className="text-[12px] text-brand font-medium mt-2 inline-block">
            Revisa tu perfil
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {[...pendientes, ...resueltas].map(s => (
            <div key={s.id} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {s.estudioNombre}{s.estudioCiudad ? ` · ${s.estudioCiudad}` : ''}
                  </p>
                  {s.mensaje && <p className="text-[12px] text-foreground mt-1">{s.mensaje}</p>}
                </div>
                <span className={cn('text-[11px] font-medium shrink-0', ESTADO_INFO[s.estado].cls)}>
                  {ESTADO_INFO[s.estado].texto}
                </span>
              </div>
              {s.estado === 'pendiente' && (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => resolver(s.id, true)}
                    disabled={resolviendoId === s.id}
                    className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {resolviendoId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Aceptar
                  </button>
                  <button
                    onClick={() => resolver(s.id, false)}
                    disabled={resolviendoId === s.id}
                    className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <X size={13} /> Rechazar
                  </button>
                </div>
              )}
              {/* Sin esto, "Aceptada" era una palabra suelta — nada en esta
                  pantalla llevaba a la conversación de verdad, había que
                  saber que existe /network/mis-mensajes y buscar ahí el
                  hilo correcto. Un clic, directo a esa conversación. */}
              {s.estado === 'aceptada' && (
                <Link
                  href={`/network/mis-mensajes?hilo=${s.id}`}
                  className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium"
                >
                  <MessageCircle size={13} /> Enviar mensaje
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
