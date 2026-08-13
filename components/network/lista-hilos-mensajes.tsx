'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchHilosMensajesNetwork, type HiloNetwork } from '@/lib/api-client';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { HiloMensajes } from '@/components/network/hilo-mensajes';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Bandeja de hilos (brief §9/§19) — mismo componente para el lado estudio
// (app/(dashboard)/network/mensajes) y el lado instructora (app/network/
// mensajes): la API de hilos ya resuelve quién pregunta, aquí solo hace
// falta pintar la lista y abrir el hilo elegido en un DashboardSheet.
export function ListaHilosMensajes({ vacioTexto }: { vacioTexto: string }) {
  const [hilos, setHilos] = useState<HiloNetwork[] | null>(null);
  const [abierto, setAbierto] = useState<HiloNetwork | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchHilosMensajesNetwork().then(h => { if (vivo) setHilos(h); });
    return () => { vivo = false; };
  }, []);

  if (!hilos) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hilos.length === 0) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className="text-[13px] text-muted-foreground">{vacioTexto}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {hilos.map(h => (
          <button
            key={h.solicitudId}
            onClick={() => setAbierto(h)}
            className={`${cardCls} w-full flex items-center gap-3 p-4 text-left hover:border-brand/40 transition-colors`}
          >
            <ProfileAvatar fotoUrl={h.fotoUrl} nombre={h.nombre} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground truncate">{h.nombre}</p>
                {h.ultimoMensajeEn && <span className="text-[11px] text-muted-foreground shrink-0">{cuando(h.ultimoMensajeEn)}</span>}
              </div>
              <p className="text-[12px] text-muted-foreground truncate">
                {h.ultimoMensaje ?? 'Sin mensajes todavía'}
              </p>
            </div>
            {h.noLeidos > 0 && (
              <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-brand-foreground text-[10px] font-semibold flex items-center justify-center">
                {h.noLeidos}
              </span>
            )}
          </button>
        ))}
      </div>

      <DashboardSheet
        open={Boolean(abierto)}
        onClose={() => setAbierto(null)}
        label={abierto ? `Conversación con ${abierto.nombre}` : 'Conversación'}
        sheetClassName="bg-card rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
      >
        {abierto && (
          <>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <ProfileAvatar fotoUrl={abierto.fotoUrl} nombre={abierto.nombre} size="sm" />
              <p className="text-[13px] font-semibold text-foreground">{abierto.nombre}</p>
            </div>
            <HiloMensajes solicitudId={abierto.solicitudId} />
          </>
        )}
      </DashboardSheet>
    </>
  );
}
