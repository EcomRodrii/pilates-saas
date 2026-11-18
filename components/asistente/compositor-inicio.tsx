'use client';

import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { usePuertaAsistente } from '@/lib/asistente-context';
import { useColumnaAsistente } from '@/lib/asistente-columna';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { TextoRotatorio } from '@/components/asistente/vista-chat';

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
      className="hidden max-w-[620px] rounded-[26px] bg-muted/70 pb-1 lg:block"
    >
      <div className="flex items-end gap-2 rounded-[26px] bg-card p-3 shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f]">
        <label htmlFor="compositor-inicio" className="sr-only">Pregúntale a Tentare</label>
        <span className="relative flex min-w-0 flex-1 self-center">
          <TextoRotatorio visible={texto === ''} />
          <input
            id="compositor-inicio"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Pregúntale a Tentare…"
            className="h-10 min-w-0 flex-1 bg-transparent px-0.5 text-[13px] text-foreground placeholder:text-transparent focus:outline-none"
          />
        </span>
        <button
          type="submit"
          aria-label="Preguntar"
          disabled={!texto.trim()}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="px-4 pb-1.5 pt-2 text-[12px] text-muted-foreground">Tentare consulta tus datos y crea clases, salas, eventos y citas si tú confirmas.</p>
    </form>
  );
}
