'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ANCLA_APERTURA_SUAVE } from '@/lib/opening/listo';

export interface EstadoAperturaSuave {
  activa: boolean;
  grupo: { fundadoras: number; invitadas: { id: string; nombre: string }[] } | null;
}

const fechaLarga = (f: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${f}T00:00:00Z`));

// Apertura suave en la tarjeta de apertura: el interruptor, quién forma el grupo
// y a quién se invita. La regla la aplica el servidor al reservar; esto solo la
// configura. El día oficial se abre a todas sin que nadie toque nada.
export function AperturaSuave({ estado, fechaApertura, onGuardar }: {
  estado: EstadoAperturaSuave;
  fechaApertura: string | null;
  onGuardar: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const { socios } = useStudio();
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invitadas = estado.grupo?.invitadas ?? [];
  const idsInvitadas = useMemo(() => new Set(invitadas.map(i => i.id)), [invitadas]);
  const q = busqueda.trim().toLowerCase();
  const sugerencias = q.length < 2 ? [] : socios
    .filter(s => !idsInvitadas.has(s.id) && `${s.nombre} ${s.apellidos} ${s.email}`.toLowerCase().includes(q))
    .slice(0, 5);

  async function guardar(body: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    const e = await onGuardar(body);
    if (e) setError(e);
    setGuardando(false);
    return e;
  }

  return (
    <div id={ANCLA_APERTURA_SUAVE} tabIndex={-1} className="mt-3 scroll-mt-4 rounded-xl border border-border bg-background px-3 py-2.5">
      <label className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-foreground">Apertura suave</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {fechaApertura
              ? `Antes del ${fechaLarga(fechaApertura)} solo reservan tus fundadoras y las invitadas. Ese día se abre a todas sin que hagas nada.`
              : 'Pon la fecha de apertura para poder usarla.'}
          </span>
        </span>
        <input
          type="checkbox" role="switch" className="mt-0.5 size-4 shrink-0 accent-[var(--brand-medio)]"
          checked={estado.activa} disabled={guardando || (!fechaApertura && !estado.activa)}
          onChange={e => void guardar({ aperturaSuave: e.target.checked })}
          aria-label="Apertura suave"
        />
      </label>

      {estado.activa && estado.grupo && (
        <div className="mt-2 space-y-2">
          <p className="text-[12px] text-foreground">
            Pueden reservar: <span className="tabular-nums">{estado.grupo.fundadoras}</span> {estado.grupo.fundadoras === 1 ? 'fundadora' : 'fundadoras'}
            {' '}y <span className="tabular-nums">{invitadas.length}</span> {invitadas.length === 1 ? 'invitada' : 'invitadas'}.
          </p>
          {invitadas.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Invitadas">
              {invitadas.map(i => (
                <li key={i.id} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11.5px] text-foreground">
                  {i.nombre}
                  <button type="button" disabled={guardando} aria-label={`Quitar a ${i.nombre}`}
                    onClick={() => void guardar({ invitada: { socioId: i.id, invitada: false } })}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-60">
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <input
              type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Invitar a una clienta: escribe su nombre" aria-label="Buscar clienta para invitar"
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground"
            />
            {sugerencias.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {sugerencias.map(s => (
                  <li key={s.id}>
                    <button type="button" disabled={guardando}
                      onClick={() => void guardar({ invitada: { socioId: s.id, invitada: true } }).then(e => { if (!e) setBusqueda(''); })}
                      className="w-full rounded-md px-2 py-1 text-left text-[12.5px] text-foreground hover:bg-muted disabled:opacity-60">
                      Invitar a {[s.nombre, s.apellidos].filter(Boolean).join(' ')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Desde el mostrador puedes apuntar a cualquiera, esté o no en el grupo.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
