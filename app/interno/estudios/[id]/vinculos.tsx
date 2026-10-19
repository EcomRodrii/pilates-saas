'use client';

// Cuentas que parecen el mismo negocio (plan gratis, lib/billing/vinculos-gratis.ts).
// Lo que cuenta (misma cuenta de Stripe, mismo NIF, la mayoría de las alumnas)
// ya suma el uso solo; lo que solo avisa (navegador, conexión) está aquí para
// mirarlo. «No es el mismo negocio» lo deshace: pide un segundo clic, porque
// reabre el estudio de esta ficha.

import Link from 'next/link';
import { useState } from 'react';
import { accionEstudio } from '@/lib/interno/client';
import { TEXTO_MOTIVO, type VinculoFicha } from '@/lib/billing/vinculos-gratis';
import { useSesionInterna } from '../../layout';
import { tienePermiso } from '@/lib/interno/permisos';

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

export function CuentasVinculadas({ id, vinculos, alTerminar }: { id: string; vinculos: VinculoFicha[]; alTerminar: () => void }) {
  const sesion = useSesionInterna();
  const puede = tienePermiso(sesion.permisos, 'studios.update');
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (vinculos.length === 0) return null;

  async function desvincular(otroId: string) {
    setOcupado(true); setError(null);
    try {
      await accionEstudio(id, { accion: 'desvincular-cuenta', otroId });
      setConfirmando(null);
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido desvincular.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section data-testid="cuentas-vinculadas" className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Cuentas vinculadas · plan gratis</h2>
      <p className="text-[12px] text-muted-foreground mb-2 text-pretty">
        Estudios de otras cuentas que parecen el mismo negocio. Si «suma el uso», cuentan juntos para los límites del plan gratis.
      </p>
      {vinculos.map(v => (
        <div key={v.otroId} className="py-2 border-b border-border/50 last:border-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/interno/estudios/${v.otroId}`} className="text-[13px] font-semibold text-foreground hover:underline">{v.otroNombre}</Link>
            <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
              v.descartado ? 'bg-muted text-muted-foreground' : v.cuenta ? 'bg-amber-500/10 text-warning' : 'bg-muted text-foreground'}`}>
              {v.descartado ? 'desvinculado' : v.cuenta ? 'suma el uso' : 'solo aviso'}
            </span>
          </div>
          <ul className="mt-1 text-[12px] text-muted-foreground">
            {v.motivos.map(m => (
              <li key={m}>
                {TEXTO_MOTIVO[m]}
                {m === 'alumnas' && v.alumnas && ` (${v.alumnas.comunes} de ${v.alumnas.total})`}
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-muted-foreground">
            Detectado el {fecha(v.detectadoEn)}{v.otroEstado === 'gratis_cerrado' ? ' · el otro está cerrado' : ''}
          </p>
          {puede && !v.descartado && (
            confirmando === v.otroId ? (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-[12.5px] text-foreground text-pretty">
                  Se deshace el vínculo y <strong>este</strong> estudio se reabre y se vuelve a medir solo con lo suyo.
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado} onClick={() => desvincular(v.otroId)}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold bg-brand text-brand-foreground disabled:opacity-50">
                    Sí, no es el mismo negocio
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => setConfirmando(null)}
                    className="px-3 py-1.5 rounded-lg text-[12.5px] font-semibold text-muted-foreground hover:bg-muted">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={ocupado} onClick={() => { setError(null); setConfirmando(v.otroId); }}
                className="mt-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border border-border text-foreground hover:bg-muted disabled:opacity-50">
                No es el mismo negocio…
              </button>
            )
          )}
        </div>
      ))}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-destructive">{error}</p>}
    </section>
  );
}
