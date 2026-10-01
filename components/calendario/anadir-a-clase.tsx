'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { QrCode, Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NOMBRE_PLATAFORMA, type Plataforma } from '@/lib/plataformas/catalogo';
import { AnadirReservaPlataforma } from './anadir-reserva-plataforma';

// «Añadir clienta…» en la ficha de la clase: buscar a una clienta y apuntarla,
// o registrar una plaza vendida por ClassPass, Urban Sports Club o Wellhub (las
// que el estudio tenga conectadas). Al lado, el lector de QR con esta clase ya
// elegida.
//
// Qué pasa si no tiene bono o la clase está llena lo sigue decidiendo la página
// (aviso de sin bono, pregunta de lista de espera): aquí solo se elige a quién.

export interface ClientaElegible {
  id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
}

export function AnadirAClase({
  sesionId, confirmadas, aforo, plataformas, clientas, avisar, onAvisar, onElegirClienta, hrefQr, showToast, onPlazaPlataforma,
}: {
  sesionId: string;
  confirmadas: number;
  aforo: number;
  plataformas: Plataforma[];
  /** Activas y que no están ya en la clase. */
  clientas: ClientaElegible[];
  avisar: boolean;
  onAvisar: (v: boolean) => void;
  onElegirClienta: (socioId: string) => void;
  hrefQr: string | null;
  showToast: (m: string) => void;
  onPlazaPlataforma: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [de, setDe] = useState<'CLIENTA' | Plataforma>('CLIENTA');
  const [texto, setTexto] = useState('');
  const llena = confirmadas >= aforo;
  const q = texto.trim().toLowerCase();
  const encontradas = useMemo(
    () => clientas.filter(c => !q || `${c.nombre} ${c.apellidos}`.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)),
    [clientas, q],
  );

  function cerrar() {
    setAbierto(false);
    setTexto('');
    setDe('CLIENTA');
  }

  if (!abierto) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { onAvisar(true); setAbierto(true); }}
          className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-left text-[13.5px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <UserPlus size={16} aria-hidden />Añadir clienta a la clase
        </button>
        {hrefQr && (
          <Link
            href={hrefQr}
            title="Escanear el QR de una clienta para esta clase"
            aria-label="Escanear QR"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <QrCode size={17} />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border p-3" data-testid="anadir-a-clase">
      {plataformas.length > 0 && (
        <div role="tablist" aria-label="Qué añadir" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5 text-[12.5px] font-medium">
          {(['CLIENTA', ...plataformas] as const).map(o => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={de === o}
              onClick={() => setDe(o)}
              className={cn('rounded-md px-2.5 py-1', de === o ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {o === 'CLIENTA' ? 'Clienta' : NOMBRE_PLATAFORMA[o]}
            </button>
          ))}
        </div>
      )}

      {de !== 'CLIENTA' ? (
        <>
          {llena && (
            <p className="text-[12.5px] font-medium text-warning">
              Clase llena ({confirmadas}/{aforo}): no queda plaza para {NOMBRE_PLATAFORMA[de]}. Si ya la han vendido, cancélala allí.
            </p>
          )}
          <AnadirReservaPlataforma
            sesionId={sesionId}
            plataforma={de}
            showToast={showToast}
            onHecho={async () => { await onPlazaPlataforma(); cerrar(); }}
          />
        </>
      ) : (
        <>
          {llena && (
            <p className="text-[12.5px] font-medium text-warning">
              Clase llena ({confirmadas}/{aforo}): quien añadas entrará en lista de espera, y te lo preguntamos antes.
            </p>
          )}
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-foreground/30 bg-background px-3">
            <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
            <input
              className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none pointer-fine:text-[14px]"
              placeholder="Buscar clienta…"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              aria-label="Buscar clienta"
              autoFocus
            />
          </label>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {encontradas.slice(0, 8).map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { onElegirClienta(c.id); cerrar(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground" aria-hidden>
                    {(c.nombre[0] ?? '').toUpperCase()}{(c.apellidos[0] ?? '').toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{c.nombre} {c.apellidos}</span>
                    {c.email && <span className="block truncate text-[12px] text-muted-foreground">{c.email}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Sin resultado no había salida: con la clienta nueva delante había que
              cerrar la clase, ir a Clientas, darla de alta y volver. El alta se
              abre con lo que se buscó como nombre. */}
          {encontradas.length === 0 && (
            <div className="space-y-1.5 py-2 text-center">
              <p className="text-[12.5px] text-muted-foreground">
                {texto.trim() ? `Ninguna clienta coincide con «${texto.trim()}»` : 'No hay clientas que añadir'}
              </p>
              <Link
                href={`/clientas?nuevo=1${texto.trim() ? `&nombre=${encodeURIComponent(texto.trim())}` : ''}`}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-medio hover:underline"
              >
                <UserPlus size={13} aria-hidden />
                {texto.trim() ? `Dar de alta a «${texto.trim()}»` : 'Dar de alta una clienta nueva'}
              </Link>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={avisar} onChange={e => onAvisar(e.target.checked)} />
            Avisarla de la reserva
          </label>
        </>
      )}
      <button type="button" onClick={cerrar} className="w-full rounded-lg py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted">
        Cancelar
      </button>
    </div>
  );
}
