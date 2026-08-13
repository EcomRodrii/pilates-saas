'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { fetchMensajesNetwork, enviarMensajeNetwork } from '@/lib/api-client';
import type { MensajeNetwork } from '@/lib/network/tipos';
import { cn } from '@/lib/utils';

const hora = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Hilo de mensajería (brief §9) — el mismo componente sirve para el lado
// estudio y el lado instructora: la API resuelve quién es "yo"
// (remitenteSoyYo) según qué tipo de sesión mande el token, así que aquí no
// hace falta saber en qué lado estamos. Polling simple cada 5s mientras el
// hilo está abierto — sin Realtime en esta ronda, no hace falta para un MVP
// de mensajería de bajo volumen.
export function HiloMensajes({ solicitudId }: { solicitudId: string }) {
  const [mensajes, setMensajes] = useState<MensajeNetwork[] | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const r = await fetchMensajesNetwork(solicitudId);
      if (vivo) setMensajes(r);
    }
    void cargar();
    const id = setInterval(cargar, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, [solicitudId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mensajes?.length]);

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setEnviando(true); setError('');
    const res = await enviarMensajeNetwork(solicitudId, cuerpo);
    setEnviando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar.'); return; }
    setTexto('');
    setMensajes(await fetchMensajesNetwork(solicitudId));
  }

  return (
    <div className="flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!mensajes ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : mensajes.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">
            Todavía no hay mensajes. Escribe el primero.
          </p>
        ) : (
          mensajes.map(m => (
            <div key={m.id} className={cn('flex flex-col max-w-[80%]', m.remitenteSoyYo ? 'ml-auto items-end' : 'items-start')}>
              <div className={cn(
                'rounded-2xl px-3 py-2 text-[13px] whitespace-pre-line',
                m.remitenteSoyYo ? 'bg-brand text-brand-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
              )}>
                {m.cuerpo}
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">{hora(m.creadoEn)}</span>
            </div>
          ))
        )}
        <div ref={finRef} />
      </div>

      {error && <p className="text-[11px] text-destructive px-4">{error}</p>}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground"
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="p-2 rounded-lg bg-brand text-brand-foreground disabled:opacity-50"
        >
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
