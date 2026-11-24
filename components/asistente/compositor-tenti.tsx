'use client';

import { useState } from 'react';
import { History, Plus } from 'lucide-react';
import { usePuertaAsistente } from '@/lib/asistente-context';
import { useColumnaAsistente } from '@/lib/asistente-columna';
import { TentiIcono } from '@/components/tenti/tenti-icono';

// La caja «Trabaja con Sidekick» del Inicio de configuración de Shopify, con Tenti (24-nov-2026, `SHELL_NUEVO`): un campo
// ancho con el texto de ayuda arriba y, debajo, el avatar a la izquierda y «Recientes» y «+» a la derecha. Funciona de
// verdad con el asistente «Pregúntale a Tentare»: al enviar (Intro) abre su columna con la pregunta en memoria (nunca en la URL);
// «Recientes» y «+» abren la columna (ahí están sus conversaciones y se empieza una nueva). El micrófono y el audio de Shopify
// no están: Tentare no tiene voz todavía, y un botón que no hace nada es peor que no ponerlo.
// Tenti es el avatar del campo, no va dentro de un botón (se deja tocar) y no está junto a ningún cobro.
// Solo donde el asistente está disponible (`usePuertaAsistente`: rol, plan e interruptor).
const SOMBRA = 'shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f]';

export function CompositorTenti() {
  const puerta = usePuertaAsistente();
  const { abrir } = useColumnaAsistente();
  const [texto, setTexto] = useState('');
  if (!puerta) return null;
  const enviar = () => {
    if (!texto.trim()) return;
    abrir(texto);
    setTexto('');
  };
  return (
    <form data-compositor-tenti onSubmit={e => { e.preventDefault(); enviar(); }} className="mx-auto w-full max-w-[620px]">
      <div className={`rounded-[20px] bg-card px-4 pb-3 pt-3.5 transition-shadow focus-within:shadow-[0_0_0_1px_#0000004d,0_5px_16px_#0000000f] ${SOMBRA}`}>
        <label htmlFor="compositor-tenti" className="sr-only">Trabaja con Tenti</label>
        <input
          id="compositor-tenti"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          maxLength={500}
          autoComplete="off"
          placeholder="Trabaja con Tenti"
          className="block h-6 w-full bg-transparent text-[13px] text-foreground placeholder:text-[#707070] focus:outline-none dark:placeholder:text-muted-foreground"
        />
        <div className="mt-5 flex items-center justify-between">
          <span aria-hidden="true" className="flex size-[26px] items-center justify-center"><TentiIcono ancho={22} /></span>
          <div className="flex items-center gap-1 text-[12px] font-medium text-foreground">
            <button type="button" onClick={() => abrir()} className="zona-tactil inline-flex h-7 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-muted">
              <History size={14} aria-hidden="true" />Recientes
            </button>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
            <button type="button" onClick={() => abrir()} aria-label="Nueva conversación con Tenti" className="zona-tactil inline-flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-muted">
              <Plus size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
