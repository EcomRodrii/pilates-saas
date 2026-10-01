'use client';

import { useEffect, useState } from 'react';
import { dbGuardarCupoPlataformaTipo, dbListarCuposPlataformaTipo } from '@/lib/supabase-data';
import { NOMBRE_PLATAFORMA, type Plataforma } from '@/lib/plataformas/catalogo';
import { leerPlazasCedidas } from '@/lib/plataformas/cupo';
import { usePlataformasActivas } from '@/components/configuracion/plataformas-externas';

// Cuántas plazas de cada clase de este tipo cede el estudio a cada plataforma.
//
// Es un TECHO compartido, no plazas apartadas: si la plataforma no las vende,
// las socias del estudio pueden ocuparlas. En blanco = sin límite propio (manda
// el aforo de la clase). Se guarda al salir del campo, igual que se guarda en
// la plataforma: no forma parte del formulario del tipo de clase porque vive en
// otra tabla (`plataforma_cupos`) y no tiene nada que ver con su «Guardar».
export function PlazasPlataformasTipo({
  tipoClaseId, requiereAutorizacion, aforoPorDefecto,
}: {
  /** null mientras el tipo de clase aún no existe (alta nueva). */
  tipoClaseId: string | null;
  requiereAutorizacion: boolean;
  aforoPorDefecto: number | null;
}) {
  const activas = usePlataformasActivas();
  const [guardadas, setGuardadas] = useState<Partial<Record<Plataforma, number>>>({});
  const [texto, setTexto] = useState<Partial<Record<Plataforma, string>>>({});
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tipoClaseId || activas.length === 0) return;
    let vivo = true;
    void dbListarCuposPlataformaTipo(tipoClaseId).then(c => {
      if (!vivo) return;
      setGuardadas(c);
      setTexto(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, String(v)])));
      setCargado(true);
    });
    return () => { vivo = false; };
  }, [tipoClaseId, activas.length]);

  if (activas.length === 0) return null;

  if (requiereAutorizacion) {
    return (
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Esta clase exige autorización previa, así que no se vende fuera: quien viene de una plataforma no tiene ficha donde constar esa autorización.
      </p>
    );
  }
  if (!tipoClaseId) {
    return <p className="text-[11.5px] text-muted-foreground">Guarda el tipo de clase y después podrás decidir cuántas plazas cedes a cada plataforma.</p>;
  }

  async function guardar(p: Plataforma) {
    const lectura = leerPlazasCedidas(texto[p] ?? '', aforoPorDefecto);
    if (!lectura.ok) { setError(lectura.error); return; }
    setError(null);
    if ((guardadas[p] ?? null) === lectura.plazas) return;
    const res = await dbGuardarCupoPlataformaTipo(tipoClaseId!, p, lectura.plazas);
    if (!res.ok) { setError(res.error); return; }
    setGuardadas(g => {
      const nuevo = { ...g };
      if (lectura.plazas == null) delete nuevo[p]; else nuevo[p] = lectura.plazas;
      return nuevo;
    });
  }

  return (
    <div className="space-y-3" data-testid="plazas-plataformas">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Las plazas que cedes son un máximo, no plazas reservadas: si la plataforma no las vende, tus alumnas pueden ocuparlas.
        En blanco, sin límite (manda el aforo de la clase). Pon la misma cifra que tienes publicada en la plataforma.
      </p>
      {activas.map(p => (
        <label key={p} className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium text-foreground">{NOMBRE_PLATAFORMA[p]}</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              disabled={!cargado}
              aria-label={`Plazas que cedes a ${NOMBRE_PLATAFORMA[p]} por clase`}
              placeholder="Sin límite"
              value={texto[p] ?? ''}
              onChange={e => setTexto(t => ({ ...t, [p]: e.target.value }))}
              onBlur={() => void guardar(p)}
              className="w-24 rounded-lg border border-border bg-card px-2.5 py-1.5 text-right text-sm text-foreground focus:outline-none focus:border-muted-foreground"
            />
            <span className="text-[11.5px] text-muted-foreground">por clase</span>
          </span>
        </label>
      ))}
      {error && <p role="alert" className="text-[11.5px] font-semibold text-destructive">{error}</p>}
    </div>
  );
}
