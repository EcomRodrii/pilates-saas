'use client';

// La cola de moderación de Tentare (App Store 1.2; decisión del fundador,
// 5-oct-2026). El estudio revisa en su panel las denuncias de su app; aquí
// llegan solo dos cosas: las que van contra el propio estudio (su hilo con la
// alumna, o algo escrito por una propietaria) y las que el estudio no revisó en
// 24 h. Decidir avisa a cada parte igual que cuando decide el estudio, y la RPC
// vuelve a comprobar que le toca a Tentare.

import { useCallback, useEffect, useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';
import { decidirDenunciaInterno, fetchDenunciasInterno, SinAcceso, type DenunciaInterna } from '@/lib/interno/client';
import { etiquetaAmbito } from '@/lib/moderacion/denuncias';

const ETIQUETA_ACCION: Record<DenunciaInterna['acciones'][number], string> = {
  MANTENER: 'Mantener',
  OCULTAR: 'Retirar',
  CERRAR_CONVERSACION: 'Cerrar conversación',
};

const POR_QUE: Record<DenunciaInterna['porQue'], string> = {
  CONTRA_EL_ESTUDIO: 'Contra el estudio',
  SIN_REVISAR_POR_EL_ESTUDIO: 'El estudio no la revisó en 24 h',
};

function hace(iso: string): string {
  const horas = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3600_000));
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} días`;
}

export default function DenunciasInternoPage() {
  const [items, setItems] = useState<DenunciaInterna[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchDenunciasInterno();
      setItems(r.denuncias);
      setError(null);
    } catch (e) {
      setError(e instanceof SinAcceso ? e.message : 'No se han podido cargar las denuncias.');
    }
  }, []);

  // setState tras await, no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function decidir(d: DenunciaInterna, accion: DenunciaInterna['acciones'][number]) {
    if (enviando) return;
    setEnviando(d.id);
    try {
      await decidirDenunciaInterno(d.id, accion);
      setAviso(accion === 'MANTENER' ? 'Mantenido. Avisamos a quien la hizo.' : accion === 'OCULTAR'
        ? 'Retirado. Avisamos a quien la hizo y a quien lo escribió.' : 'Conversación cerrada.');
    } catch (e) {
      // Ya decidida (por el estudio o por otra persona de Tentare): se relee igual.
      setAviso(e instanceof Error ? e.message : 'No se ha podido guardar la decisión.');
    } finally {
      setEnviando(null);
      // Las demás denuncias del mismo contenido se cierran a la vez.
      void cargar();
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!items) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Cargando denuncias…</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-foreground">Denuncias de la app</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Las que van contra el propio estudio y las que el estudio no ha revisado en 24 horas. El resto las decide cada estudio en su panel.
        </p>
      </div>

      {aviso && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-foreground">{aviso}</p>}

      {items.length === 0 ? (
        <p className="text-[13.5px] text-muted-foreground">No hay ninguna denuncia esperando a Tentare.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((d) => (
            <div key={d.id} data-testid="denuncia-interna" className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <Flag size={13} className="text-muted-foreground" />
                <span className="font-semibold text-foreground">{d.estudio.nombre}</span>
                <span className="text-muted-foreground">· {d.motivo === 'BLOQUEO' ? 'Bloqueo' : 'Denuncia'} · {etiquetaAmbito(d.ambito)} · {hace(d.creadaEn)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">{POR_QUE[d.porQue]}</span>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                {[d.denunciante && `De ${d.denunciante}`, d.autor && `sobre ${d.autor}`].filter(Boolean).join(' · ')}
              </p>
              {d.contenido && (
                <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground">
                  {d.contenido}
                  {d.contenidoRetirado && <span className="ml-1 text-[11px] text-muted-foreground">(ya retirado)</span>}
                </p>
              )}
              {d.detalle && <p className="text-[12.5px] italic text-foreground/80">«{d.detalle}»</p>}
              <div className="flex flex-wrap justify-end gap-2">
                {d.acciones.map((a) => (
                  <button key={a} type="button" disabled={enviando !== null} onClick={() => void decidir(d, a)}
                    className={a === 'MANTENER'
                      ? 'px-3 py-1.5 rounded-lg border border-border text-[12.5px] font-semibold text-foreground disabled:opacity-50'
                      : 'px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12.5px] font-semibold disabled:opacity-50'}>
                    {enviando === d.id && a !== 'MANTENER' ? 'Guardando…' : ETIQUETA_ACCION[a]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
