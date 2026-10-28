'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { TentiIcono } from '@/components/tenti/tenti-icono';
import { MAX_TEXTO_MENSAJE } from '@/lib/demo/tenti';
import type { MensajeHistorial } from '@/lib/demo/tenti';

export interface MensajeChat extends MensajeHistorial {
  id: number;
  /** Solo de pantalla (saludo, avisos): nunca se manda al modelo ni cuenta como pregunta. */
  local?: boolean;
}

interface Props {
  mensajes: MensajeChat[];
  escribiendo: boolean;
  opciones: string[];
  error: string | null;
  onEnviar: (texto: string) => void;
  onReintentar: () => void;
}

// La conversación. `aria-live="polite"` en la lista: un lector de pantalla oye
// cada mensaje nuevo de Tenti sin que se le arrebate el foco. El campo de texto
// está SIEMPRE disponible, también con respuestas rápidas.
export function ChatTenti({ mensajes, escribiendo, opciones, error, onEnviar, onReintentar }: Props) {
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: 'end', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [mensajes.length, escribiendo]);

  function enviar() {
    const t = texto.trim();
    if (!t || escribiendo) return;
    setTexto('');
    onEnviar(t);
    campo.current?.focus();
  }

  return (
    <div className="dm-chat">
      {/* Un solo Tenti, en la cabecera del chat (no uno por mensaje: cada uno monta un canvas). «Pensando» solo mientras la petición va. */}
      <div className="dm-tenti-cab">
        <TentiIcono ancho={28} estado={escribiendo ? 'pensando' : 'reposo'} />
        <span className="dm-tenti-nombre">Tenti</span>
      </div>
      <div role="log" aria-live="polite" aria-busy={escribiendo} aria-label="Conversación con Tenti" style={{ display: 'grid', gap: 14 }}>
        {mensajes.map((m) => (
          <div key={m.id} className={`dm-msg ${m.rol === 'usuario' ? 'dm-msg-yo' : 'dm-msg-tenti'}`}>
            <div className="dm-burbuja">
              {m.rol === 'tenti' && <span className="dm-solo-lectores">Tenti: </span>}
              {m.texto}
            </div>
          </div>
        ))}
        {escribiendo && (
          <div className="dm-msg dm-msg-tenti">
            <div className="dm-burbuja" role="status" aria-label="Tenti está escribiendo">
              <span className="dm-escribiendo" aria-hidden="true"><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="dm-aviso" data-tono="error" role="alert">
          {error}{' '}
          <button type="button" className="dm-rapida" onClick={onReintentar} style={{ marginLeft: 8 }}>Reintentar</button>
        </div>
      )}
      {!escribiendo && opciones.length > 0 && (
        <div className="dm-rapidas" role="group" aria-label="Respuestas rápidas">
          {opciones.map((o) => <button key={o} type="button" className="dm-rapida" onClick={() => onEnviar(o)}>{o}</button>)}
        </div>
      )}
      <div ref={fin} />
      <form className="dm-redactar" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <label className="dm-solo-lectores" htmlFor="dm-texto">Escribe tu duda</label>
        <textarea
          id="dm-texto" ref={campo} rows={1} value={texto} maxLength={MAX_TEXTO_MENSAJE}
          placeholder="Escribe aquí tu duda…" disabled={escribiendo}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
        />
        <button type="submit" className="dm-icono-btn" aria-label="Enviar" disabled={escribiendo || !texto.trim()}
          style={{ background: 'var(--w-olive)', color: 'var(--w-cream)' }}>
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
