'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Users } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Agrupa mensajes consecutivos por día para separadores tipo "Hoy".
function esMismoDia(a: string, b: string) {
  return a.slice(0, 10) === b.slice(0, 10);
}

const AVATAR_COLORS = ['#FFC8E2', '#A7F3D0', '#BFDBFE', '#FDE68A', '#DDD6FE', '#FECACA'];
function avatarColor(nombre: string) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ChatEquipoPage() {
  const { mensajesEquipo, addMensajeEquipo } = useStudio();
  const [texto, setTexto] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const ordenados = [...mensajesEquipo].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [ordenados.length]);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio) return;
    addMensajeEquipo(limpio);
    setTexto('');
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] lg:h-[calc(100vh-90px)] max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-[#8E8E86]" />
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Chat de equipo</h1>
          <p className="text-xs text-[#8E8E86]">Canal compartido — propietaria, recepción e instructoras</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-white border border-[#E7E7E0] rounded-xl p-4 space-y-3">
        {ordenados.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <p className="text-sm text-[#8E8E86]">
              Sin mensajes todavía. Escribe el primero para avisar al resto del equipo.
            </p>
          </div>
        ) : (
          ordenados.map((m, i) => {
            const anterior = ordenados[i - 1];
            const nuevoDia = !anterior || !esMismoDia(anterior.creadoEn, m.creadoEn);
            return (
              <div key={m.id}>
                {nuevoDia && (
                  <div className="flex items-center gap-2 my-3">
                    <div className="flex-1 h-px bg-[#F1F1EC]" />
                    <span className="text-[10px] font-medium text-[#A8A89F] uppercase tracking-wide">
                      {formatFecha(m.creadoEn)}
                    </span>
                    <div className="flex-1 h-px bg-[#F1F1EC]" />
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-[#1A1A1A]"
                    style={{ backgroundColor: avatarColor(m.autorNombre) }}
                  >
                    {m.autorNombre.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[#1A1A1A]">{m.autorNombre}</span>
                      <span className="text-[10px] text-[#A8A89F]">{formatHora(m.creadoEn)}</span>
                    </div>
                    <p className="text-sm text-[#3A3A34] whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Escribe un mensaje al equipo…"
          className="flex-1 rounded-xl border border-[#E7E7E0] px-4 py-2.5 text-sm focus:outline-none focus:border-[#FFC8E2] focus:ring-2 focus:ring-[#FFC8E2]/30 transition-all"
        />
        <button
          onClick={enviar}
          disabled={!texto.trim()}
          className="shrink-0 w-10 h-10 rounded-xl bg-[#1A1A1A] text-white flex items-center justify-center hover:bg-[#333] transition-colors disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
