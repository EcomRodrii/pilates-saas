'use client';

// Niveles: qué clases con requisito puede reservar esta socia.
//
// Solo se pinta si el estudio ha marcado alguna clase como "solo para alumnas
// autorizadas". Un estudio que no use niveles no ve esta sección en ninguna
// ficha — la regla no existe hasta que se enciende, y la ficha tampoco debe
// insinuar que existe.
//
// La lista se pide POR SOCIA al abrir la ficha, no viaja en la carga global del
// panel: es un dato de esta pantalla, y arrastrarlo en el contexto lo dejaría
// creciendo con cada alumna sin que nadie lo mire.

import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { dbListAutorizadosDeSocia, dbAutorizarTipoClase, dbDesautorizarTipoClase } from '@/lib/supabase-data';
import { useRol, puedeGestionarClientas } from '@/lib/permisos';
import { ShieldCheck, Loader2 } from 'lucide-react';

export function FichaClasesAutorizadas({ socioId, studioId, onToast }: {
  socioId: string;
  studioId: string;
  onToast: (mensaje: string) => void;
}) {
  const { tiposClase } = useStudio();
  // Misma cerradura que conceder una recuperación: es una decisión de
  // mostrador. La RLS lo rechaza igual (migr 20260905011213); esto solo evita
  // ofrecer un botón que va a fallar.
  const puedeTocar = puedeGestionarClientas(useRol());

  const conRequisito = tiposClase.filter(t => t.requiereAutorizacion);
  // `conRequisito` se recalcula en cada render (es un filter), así que como
  // dependencia dispararía la consulta en bucle: se depende de su tamaño.
  const hayRequisito = conRequisito.length;
  const [autorizados, setAutorizados] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    // Sin clases con requisito no se consulta nada: el componente ya no pinta.
    if (hayRequisito === 0) return;
    let vivo = true;
    dbListAutorizadosDeSocia(studioId, socioId).then(ids => {
      if (vivo) setAutorizados(new Set(ids));
    });
    return () => { vivo = false; };
  }, [studioId, socioId, hayRequisito]);

  if (conRequisito.length === 0) return null;

  async function alternar(tipoId: string, ahoraAutorizada: boolean) {
    if (!puedeTocar || guardando) return;
    setGuardando(tipoId);
    const res = ahoraAutorizada
      ? await dbDesautorizarTipoClase(studioId, socioId, tipoId)
      : await dbAutorizarTipoClase(studioId, socioId, tipoId);
    setGuardando(null);
    if (!res.ok) { onToast(res.error); return; }
    setAutorizados(prev => {
      const s = new Set(prev ?? []);
      if (ahoraAutorizada) s.delete(tipoId); else s.add(tipoId);
      return s;
    });
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <div className="mb-3">
        <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-muted-foreground shrink-0" /> Clases con requisito
        </p>
        <p className="text-xs text-muted-foreground">
          Estas clases solo las reserva quien tú autorices. El resto las reserva con normalidad.
        </p>
      </div>

      {autorizados === null ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
          <Loader2 size={13} className="animate-spin" /> Cargando…
        </p>
      ) : (
        <div className="space-y-2">
          {conRequisito.map(t => {
            const ok = autorizados.has(t.id);
            return (
              <label
                key={t.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${puedeTocar ? 'cursor-pointer' : ''} ${ok ? 'border-border bg-card' : 'border-dashed border-border bg-muted/30'}`}
              >
                <span className="min-w-0">
                  <span className={`text-sm font-semibold block ${ok ? 'text-foreground' : 'text-muted-foreground'}`}>{t.nombre}</span>
                  <span className="text-xs text-muted-foreground">{ok ? 'Puede reservarla' : 'No puede reservarla'}</span>
                </span>
                <input
                  type="checkbox"
                  checked={ok}
                  disabled={!puedeTocar || guardando === t.id}
                  onChange={() => alternar(t.id, ok)}
                  className="w-4 h-4 rounded accent-brand shrink-0 disabled:opacity-40"
                  aria-label={`Autorizar ${t.nombre}`}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
