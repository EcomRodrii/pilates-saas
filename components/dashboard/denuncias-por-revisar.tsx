'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flag } from 'lucide-react';
import { decidirDenuncia, listarDenunciasPorRevisar, type DenunciaPorRevisar } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio, useAnclaDeAviso } from '@/lib/estado-estudio-cliente';
import { etiquetaAmbito, horasHastaTentare } from '@/lib/moderacion/denuncias';
import { Button } from '@/components/ui/button';

// Denuncias y bloqueos de la app que esperan al estudio (App Store 1.2). Mismo
// alcance que `BajasPorRevisar`: una lista y sus botones, dentro de la bandeja,
// y se oculta sola si no hay nada.
//
// Decisión del fundador (5-oct-2026): las revisa el estudio; si nadie lo hace en
// 24 h, las revisa Tentare. Lo que se puede decidir lo manda el servidor
// (`acciones`): cerrar la conversación solo la propietaria y solo en un chat con
// una instructora. Quien escribió lo denunciado no lo ve aquí para decidir sobre
// sí mismo (lo comprueba la base de datos).
//
// Se monta para quien revisa algún ámbito (el servidor filtra por rol).

const ETIQUETA_ACCION: Record<DenunciaPorRevisar['acciones'][number], string> = {
  MANTENER: 'Mantener',
  OCULTAR: 'Retirar',
  CERRAR_CONVERSACION: 'Cerrar conversación',
};

const AVISO_ACCION: Record<DenunciaPorRevisar['acciones'][number], string> = {
  MANTENER: 'Mantenido. Le avisamos de que lo has revisado.',
  OCULTAR: 'Retirado. Le avisamos a quien lo denunció y a quien lo escribió.',
  CERRAR_CONVERSACION: 'Conversación cerrada. Ya no se puede escribir en ella.',
};

function enlaceContexto(d: DenunciaPorRevisar): string | null {
  if (d.ambito === 'TABLON') return '/comunidad';
  if (d.conversacionId) return `/mensajeria?conversacion=${encodeURIComponent(d.conversacionId)}`;
  return null;
}

export function DenunciasPorRevisar({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<DenunciaPorRevisar[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarDenunciasPorRevisar().then((r) => { if (vivo) setItems(r ?? []); });
    return () => { vivo = false; };
  }, []);
  useAnclaDeAviso(ANCLA_DECIDIR.denunciasPorRevisar, items !== null);

  const quitar = (id: string) => {
    setItems((prev) => (prev ?? []).filter((d) => d.id !== id));
    invalidarEstadoEstudio();
  };

  async function decidir(d: DenunciaPorRevisar, accion: DenunciaPorRevisar['acciones'][number]) {
    if (enviando) return;
    setEnviando(d.id);
    const r = await decidirDenuncia(d.id, accion);
    setEnviando(null);
    if ('error' in r) {
      // Ya la decidió otra persona (o ya le toca a Tentare): la fila sobra, y se dice por qué se va.
      if (r.status === 409 || r.status === 404) quitar(d.id);
      onToast(r.error);
      return;
    }
    // Las demás denuncias del mismo contenido se resuelven a la vez: se relee la lista.
    void listarDenunciasPorRevisar().then((lista) => { if (lista) setItems(lista); });
    quitar(d.id);
    onToast(AVISO_ACCION[accion]);
  }

  if (!items?.length) return null;

  return (
    <div id={ANCLA_DECIDIR.denunciasPorRevisar} tabIndex={-1} data-testid="denuncias-por-revisar"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <Flag className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Una denuncia de la app por revisar' : `${items.length} denuncias de la app por revisar`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Si nadie la revisa en 24 horas, la revisa Tentare. Quien la hizo recibe un aviso con lo que decidas.
      </p>

      <div className="flex flex-col gap-2">
        {items.map((d) => {
          const horas = horasHastaTentare(d.creadaEn);
          const contexto = enlaceContexto(d);
          return (
            <div key={d.id} data-testid="denuncia" className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] text-foreground">
                  {d.motivo === 'BLOQUEO' ? 'Bloqueo' : 'Denuncia'} · {etiquetaAmbito(d.ambito)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {[d.denunciante && `De ${d.denunciante}`, d.autor && `sobre ${d.autor}`,
                    horas > 0 ? `${horas} h para que la revise Tentare` : 'Tentare ya puede revisarla'].filter(Boolean).join(' · ')}
                </p>
                {d.contenido && (
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground">
                    {d.contenido}
                    {d.contenidoRetirado && <span className="ml-1 text-[11px] text-muted-foreground">(ya retirado)</span>}
                  </p>
                )}
                {d.detalle && <p className="mt-1 text-[12px] italic text-foreground/80">«{d.detalle}»</p>}
                {contexto && (
                  <Link href={contexto} className="mt-1 inline-block text-[11.5px] font-medium text-brand underline-offset-2 hover:underline">
                    Ver {d.ambito === 'TABLON' ? 'el tablón' : 'la conversación'}
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {d.acciones.map((a) => (
                  <Button key={a} size="sm" variant={a === 'MANTENER' ? 'outline' : 'default'} disabled={enviando !== null}
                    onClick={() => void decidir(d, a)}>
                    {enviando === d.id && a !== 'MANTENER' ? 'Guardando…' : ETIQUETA_ACCION[a]}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
