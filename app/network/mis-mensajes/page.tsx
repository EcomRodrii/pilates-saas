'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchHilosMensajesNetwork, type HiloNetwork } from '@/lib/api-client';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { HiloMensajes } from '@/components/network/hilo-mensajes';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO } from '@/components/network-v2/tokens';
import { cn } from '@/lib/utils';

// Rediseño 2026-09 (Fase 5 del mockup del fundador) — de una lista + modal
// (DashboardSheet) a un inbox de dos paneles, mismo principio que fases
// 1-4: tokens NW_*, cero dato inventado. La lista de hilos se reconstruye
// AQUÍ, propia de esta página (no se toca `ListaHilosMensajes`, que sigue
// siendo el componente compartido con el lado estudio en app/(dashboard)/
// network/mensajes — tocarlo habría arriesgado esa pantalla para un cambio
// que solo pedía el lado instructora). `HiloMensajes` SÍ se reutiliza tal
// cual (mensajes, polling, formalizar contratación) — es el mismo
// componente compartido, pero autocontenido y ya con tokens de panel que
// coinciden con NW_* hoy (auditoría de sistema de diseño 2026-08-18), así
// que no desentona dentro del panel derecho.
//
// Sin distancia/anchura fijas: el mockup mostraba el hilo abierto siempre a
// la derecha en desktop; aquí se replica con CSS grid de dos columnas desde
// `lg`, y en móvil se colapsa a una vista a la vez (lista → hilo → volver),
// sin duplicar `HiloMensajes` en un modal aparte.
const cuando = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function MensajesNetworkPage() {
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const [hilos, setHilos] = useState<HiloNetwork[] | null>(null);
  const [abierto, setAbierto] = useState<HiloNetwork | null>(null);
  const [hiloDesdeQuery, setHiloDesdeQuery] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee el query param una vez al montar, sin suspender el árbol (mismo motivo que el resto del panel).
    setHiloDesdeQuery(new URLSearchParams(window.location.search).get('hilo'));
  }, []);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchHilosMensajesNetwork().then(h => {
      if (!vivo) return;
      setHilos(h);
      if (hiloDesdeQuery) {
        const hilo = h.find(x => x.solicitudId === hiloDesdeQuery);
        if (hilo) setAbierto(hilo);
      }
    });
    return () => { vivo = false; };
  }, [user, hiloDesdeQuery]);

  if (cargandoSesion || !user) return null;

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-[22px] font-extrabold mb-5" style={{ color: NW_TINTA }}>Mensajes</h1>

      {!hilos ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: NW_BORDE, borderTopColor: NW_PRODUCTO }} />
        </div>
      ) : hilos.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: NW_SAND }}>
          <MessageCircle size={22} style={{ color: NW_MUTED_2 }} className="mx-auto mb-2" />
          <p className="text-[13px]" style={{ color: NW_MUTED }}>Todavía no tienes ninguna conversación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5" style={{ minHeight: 520 }}>
          {/* Lista — oculta en móvil cuando hay un hilo abierto, para que
              "abrir conversación" reemplace la lista en vez de apilarse. */}
          <div className={cn('space-y-1.5', abierto && 'hidden lg:block')}>
            {hilos.map(h => {
              const activo = abierto?.solicitudId === h.solicitudId;
              return (
                <button
                  key={h.solicitudId}
                  onClick={() => setAbierto(h)}
                  className="w-full flex items-center gap-2.5 p-3 rounded-2xl text-left transition-colors"
                  style={activo ? { background: NW_SAND } : { background: 'transparent' }}
                >
                  <ProfileAvatar fotoUrl={h.fotoUrl} nombre={h.nombre} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold truncate" style={{ color: NW_TINTA }}>{h.nombre}</p>
                      {h.ultimoMensajeEn && <span className="text-[10.5px] shrink-0" style={{ color: NW_MUTED_2 }}>{cuando(h.ultimoMensajeEn)}</span>}
                    </div>
                    <p className="text-[12px] truncate" style={{ color: NW_MUTED }}>{h.ultimoMensaje ?? 'Sin mensajes todavía'}</p>
                  </div>
                  {h.noLeidos > 0 && (
                    <span
                      className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                      style={{ background: NW_PRODUCTO }}
                    >
                      {h.noLeidos}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Hilo — en móvil, ocupa toda la pantalla cuando está abierto. */}
          <div className={cn('rounded-2xl overflow-hidden', !abierto && 'hidden lg:flex lg:items-center lg:justify-center')} style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            {abierto ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${NW_BORDE}` }}>
                  <button onClick={() => setAbierto(null)} className="lg:hidden text-[12px] font-bold mr-1" style={{ color: NW_MUTED }}>←</button>
                  <ProfileAvatar fotoUrl={abierto.fotoUrl} nombre={abierto.nombre} size="sm" />
                  <p className="text-[13px] font-bold" style={{ color: NW_TINTA }}>{abierto.nombre}</p>
                </div>
                <HiloMensajes solicitudId={abierto.solicitudId} />
              </div>
            ) : (
              <p className="text-[13px] py-16" style={{ color: NW_MUTED_2 }}>Elige una conversación para empezar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
