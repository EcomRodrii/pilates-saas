'use client';

import { MessageCircleQuestionMark } from 'lucide-react';
import { useAsistente, usePuertaAsistente } from '@/lib/asistente-context';

// La puerta del Centro de Control (spec §5.1): una línea con aspecto de campo,
// bajo el h1, que abre el panel. Ligera a propósito (va en el chunk del Centro
// de Control): ni Tenti —la cara va en la cabecera del panel— ni el panel, que
// llega aparte al abrirlo. No se pinta si el rol, el plan o el servidor no lo
// permiten (usePuertaAsistente).

export function BarraPreguntar() {
  const puerta = usePuertaAsistente();
  const { abrir } = useAsistente();
  if (!puerta) return null;
  return (
    <button
      type="button"
      onClick={() => abrir()}
      data-testid="barra-preguntar"
      className="group flex h-11 w-full items-center gap-3 rounded-full bg-muted px-4 text-left transition-colors hover:bg-muted/70"
    >
      <MessageCircleQuestionMark size={17} aria-hidden="true" className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      <span className="min-w-0 flex-1 truncate text-[14px] text-muted-foreground">Pregúntale a Tentare sobre tu estudio…</span>
      <kbd className="hidden shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">⌘J</kbd>
    </button>
  );
}
