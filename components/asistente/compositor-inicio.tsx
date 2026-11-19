'use client';

import { useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import { usePuertaAsistente } from '@/lib/asistente-context';
import { useColumnaAsistente } from '@/lib/asistente-columna';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { TextoRotatorio } from '@/components/asistente/texto-rotatorio';

// El compositor de la home de Shopify, en el Resumen (marco a sangre): una tarjeta de radio 26 bajo el saludo
// con el texto que rota y, debajo, la pestaña gris. Al enviar, abre la COLUMNA del asistente con la pregunta ya
// puesta (el chat la manda al montarse). Solo con `SHELL_NUEVO` y donde el asistente está disponible
// (`usePuertaAsistente`: rol, plan e interruptor). Sin Tenti: no está en su lista de sitios.
export function CompositorInicio() {
  const shell = useShellNuevo();
  const puerta = usePuertaAsistente();
  const { abrir } = useColumnaAsistente();
  const [texto, setTexto] = useState('');
  if (!shell || !puerta) return null;
  const enviar = () => {
    if (!texto.trim()) return;
    abrir(texto);
    setTexto('');
  };
  return (
    <form
      data-compositor-inicio
      onSubmit={e => { e.preventDefault(); enviar(); }}
      className="hidden max-w-[620px] md:block"
    >
      <div className="rounded-[20px] bg-card p-3 shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f] transition-shadow focus-within:shadow-[0_0_0_1px_#0000004d,0_5px_16px_#0000000f]">
        <label htmlFor="compositor-inicio" className="sr-only">Pregúntale a Tentare</label>
        <span className="relative block">
          <TextoRotatorio visible={texto === ''} />
          <input
            id="compositor-inicio"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Pregúntale a Tentare…"
            className="block h-9 w-full bg-transparent px-0.5 text-[13px] text-foreground placeholder:text-transparent focus:outline-none"
          />
        </span>
        <div className="mt-1 flex items-center justify-between">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--t-blue-500)_12%,white)] text-[var(--t-blue-500)]"><Sparkles size={13} /></span>
          <button
            type="submit"
            aria-label="Preguntar"
            disabled={!texto.trim()}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          >
            <ArrowUp size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="px-2 pt-2 text-[12px] text-muted-foreground">Te responde con los datos de tu estudio y no cambia nada sin tu visto bueno.</p>
    </form>
  );
}
