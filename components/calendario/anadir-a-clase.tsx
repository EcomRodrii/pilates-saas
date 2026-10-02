'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, CreditCard, Gift, QrCode, Search, Smartphone, Ticket, UserPlus } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { NOMBRE_PLATAFORMA, type Plataforma } from '@/lib/plataformas/catalogo';
import type { LineaCobertura } from '@/lib/calendario/cobertura-mostrador';
import { AnadirReservaPlataforma } from './anadir-reserva-plataforma';

// «Añadir clienta…» en la ficha de la clase: buscar a una clienta y apuntarla,
// o registrar una plaza vendida por ClassPass, Urban Sports Club o Wellhub (las
// que el estudio tenga conectadas). Al lado, el lector de QR con esta clase ya
// elegida.
//
// Cada clienta dice con qué viene («Bono 10 clases · le quedan 3»). A la que no
// trae bono ni cuota que valga para esta clase se le cobra aquí mismo la clase
// suelta —en efectivo, con tarjeta o por Bizum, en el mostrador— o se le vende
// un bono, o se le regala (maqueta aprobada, 1-oct-2026). Antes eso era un
// diálogo aparte que dejaba el recibo pendiente para cobrarlo luego en Cobros.
//
// Cobrar lo hace la página (reserva primero y cobro por el servidor después);
// aquí solo se elige a quién y cómo paga.

export type MetodoSuelta = 'EFECTIVO' | 'TARJETA' | 'BIZUM';
const METODOS: { metodo: MetodoSuelta; texto: string; Icono: typeof Banknote }[] = [
  { metodo: 'EFECTIVO', texto: 'Efectivo', Icono: Banknote },
  { metodo: 'TARJETA', texto: 'Tarjeta', Icono: CreditCard },
  { metodo: 'BIZUM', texto: 'Bizum', Icono: Smartphone },
];

export interface ClientaElegible {
  id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
}

export function AnadirAClase({
  sesionId, confirmadas, aforo, plataformas, clientas, avisar, onAvisar, hrefQr, showToast, onPlazaPlataforma,
  coberturaDe, precio, sinPrecio, onAnadir, onCobrarYAnadir, onAnadirYCobrarDespues, onCortesia, hrefVenderBono,
}: {
  sesionId: string;
  confirmadas: number;
  aforo: number;
  plataformas: Plataforma[];
  /** Activas y que no están ya en la clase. */
  clientas: ClientaElegible[];
  avisar: boolean;
  onAvisar: (v: boolean) => void;
  hrefQr: string | null;
  showToast: (m: string) => void;
  onPlazaPlataforma: () => Promise<void>;
  /** Con qué viene a ESTA clase (lib/calendario/cobertura-mostrador.ts). */
  coberturaDe: (socioId: string) => LineaCobertura;
  /** La clase suelta de esta clase; null si desde aquí no se puede vender. */
  precio: number | null;
  /** Por qué no se puede cobrar (sin tarifa, tarifa que no vale para la clase, clase gratuita) y si se arregla en Paquetes. */
  sinPrecio: { texto: string; aPaquetes: boolean };
  /** Viene con su bono o su cuota (o va a la lista de espera). */
  onAnadir: (socioId: string) => void;
  /** Cobra la clase suelta y la apunta. `true` si ha terminado (con éxito o no) y
   *  hay que cerrar. `null` si quien mira no mueve dinero: entonces no se ofrece. */
  onCobrarYAnadir: ((socioId: string, metodo: MetodoSuelta) => Promise<boolean>) | null;
  /** Apuntarla y dejarle el recibo pendiente para cobrarlo después (lo de antes). Mismo permiso que cobrar. */
  onAnadirYCobrarDespues: ((socioId: string) => Promise<boolean>) | null;
  onCortesia: (socioId: string) => void;
  /** A la caja con ella ya elegida; null si quien mira no cobra en caja. */
  hrefVenderBono: ((socioId: string) => string) | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [de, setDe] = useState<'CLIENTA' | Plataforma>('CLIENTA');
  const [texto, setTexto] = useState('');
  // La clienta sin bono que se ha tocado: se despliega para cobrarle (una a la vez).
  const [desplegada, setDesplegada] = useState<string | null>(null);
  // Sin método marcado: elegirlo ES la confirmación. Un cobro con el método
  // equivocado no se arregla luego (el de un recibo cobrado ya no se puede
  // cambiar) y descuadra la caja y la factura (el efectivo no factura solo).
  const [metodo, setMetodo] = useState<MetodoSuelta | null>(null);
  const [cobrando, setCobrando] = useState(false);
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
    setDesplegada(null);
    setMetodo(null);
  }

  async function cobrar(socioId: string) {
    if (cobrando || !onCobrarYAnadir || !metodo) return;
    setCobrando(true);
    try {
      if (await onCobrarYAnadir(socioId, metodo)) cerrar();
    } finally {
      setCobrando(false);
    }
  }

  async function cobrarDespues(socioId: string) {
    if (cobrando || !onAnadirYCobrarDespues) return;
    setCobrando(true);
    try {
      if (await onAnadirYCobrarDespues(socioId)) cerrar();
    } finally {
      setCobrando(false);
    }
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
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {encontradas.slice(0, 8).map(c => {
              const cob = coberturaDe(c.id);
              const abiertaAqui = desplegada === c.id;
              const iniciales = `${(c.nombre[0] ?? '').toUpperCase()}${(c.apellidos[0] ?? '').toUpperCase()}`;
              const fila = (
                <>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground" aria-hidden>
                    {iniciales}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-foreground">{c.nombre} {c.apellidos}</span>
                    <span className={cn('block truncate text-[12px]', cob.sinCobertura ? 'font-medium text-[var(--calendario-tinta-aviso)]' : 'text-muted-foreground')}>
                      {cob.texto}
                    </span>
                  </span>
                </>
              );
              if (!cob.sinCobertura) {
                // Toda la fila es el botón —en el mostrador se toca el nombre y
                // entra—, con «Añadir» dentro para que se vea qué hace.
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { onAnadir(c.id); cerrar(); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
                    >
                      {fila}
                      <span className="flex min-h-9 shrink-0 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground" aria-hidden>
                        Añadir
                      </span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={c.id} className={cn('rounded-xl', abiertaAqui && 'border border-border bg-background p-2.5')}>
                  <button
                    type="button"
                    aria-expanded={abiertaAqui}
                    onClick={() => { setDesplegada(abiertaAqui ? null : c.id); setMetodo(null); }}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg text-left transition-colors', abiertaAqui ? '' : 'px-2 py-1.5 hover:bg-muted')}
                  >
                    {fila}
                  </button>
                  {abiertaAqui && (
                    <div className="mt-2.5 space-y-2.5">
                      {llena ? (
                        // Una plaza en lista de espera no se cobra: si se libera y
                        // entra, se le cobra entonces.
                        <>
                          <p className="text-[12.5px] text-muted-foreground">
                            La clase está llena: va a la lista de espera sin cobrarle nada. Si entra, cóbrale la clase en la puerta.
                          </p>
                          <button type="button" onClick={() => { onAnadir(c.id); cerrar(); }}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-[13.5px] font-semibold text-foreground hover:bg-muted">
                            Apuntarla a la lista de espera
                          </button>
                        </>
                      ) : !onCobrarYAnadir ? (
                        <p className="text-[12.5px] text-muted-foreground">
                          Cobrarle la clase suelta lo hace quien lleva los cobros. Desde aquí puedes añadirla sin cargo.
                        </p>
                      ) : precio != null && precio > 0 ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12.5px] text-muted-foreground">Paga en</span>
                            <span role="group" aria-label="Cómo paga" className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
                              {METODOS.map(m => (
                                <button
                                  key={m.metodo}
                                  type="button"
                                  aria-pressed={metodo === m.metodo}
                                  onClick={() => setMetodo(m.metodo)}
                                  className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium',
                                    metodo === m.metodo ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                                >
                                  <m.Icono size={13} aria-hidden />{m.texto}
                                </button>
                              ))}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={cobrando || !metodo}
                            title={metodo ? undefined : 'Elige primero cómo paga'}
                            onClick={() => void cobrar(c.id)}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95 disabled:opacity-60"
                          >
                            {cobrando ? 'Cobrando…' : `Cobrar ${formatEuro(precio)} y añadirla`}
                          </button>
                          {!metodo && <p className="text-[12px] text-muted-foreground">Elige cómo paga para cobrar.</p>}
                          {onAnadirYCobrarDespues && (
                            <button type="button" disabled={cobrando} onClick={() => void cobrarDespues(c.id)}
                              className="w-full text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60">
                              O apúntala y cóbraselo después (recibo pendiente en Cobros)
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="text-[12.5px] text-muted-foreground">
                          {sinPrecio.texto}
                          {sinPrecio.aPaquetes && (
                            <>{' '}<Link href="/productos" className="font-semibold text-brand-medio hover:underline">en Paquetes</Link>.</>
                          )}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {hrefVenderBono && (
                          <Link href={hrefVenderBono(c.id)}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted">
                            <Ticket size={14} aria-hidden />Venderle un bono
                          </Link>
                        )}
                        <button type="button" onClick={() => { onCortesia(c.id); cerrar(); }}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted">
                          <Gift size={14} aria-hidden />Cortesía, sin cargo
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
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
