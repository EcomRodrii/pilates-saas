'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, PackagePlus, PackageMinus, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { cargarStock, moverStock, esError, type MovimientoStock } from '@/lib/pos/cliente';

// ─────────────────────────────────────────────────────────────────────────────
// Existencias: meterlas, perderlas, contarlas — y poder explicar el número.
//
// Antes el stock era un campo de texto en el formulario del producto: se
// pasaba de 3 a 300 y no quedaba rastro. Eso no es control de existencias, es
// un número editable, y es el hueco por el que se tapa una merma.
//
// Tres verbos, porque son los tres que ocurren de verdad en un estudio:
//   · Entrada — llegó el pedido.
//   · Merma   — se rompió, caducó, se perdió.
//   · Recuento — lo he contado y hay otra cantidad.
//
// ⚠️ El recuento pide CUÁNTAS HAY, no cuántas quitar. Quien cuenta dice «hay
// 7»; obligarle a calcular «-3» es pedirle que haga una resta con la caja
// delante, y es donde se equivoca. La diferencia la calcula el servidor con la
// fila bloqueada, así que tampoco puede colarse una venta por medio.
// ─────────────────────────────────────────────────────────────────────────────

type Accion = 'ENTRADA' | 'MERMA' | 'AJUSTE';

const ACCIONES: { id: Accion; etiqueta: string; icono: typeof PackagePlus; pregunta: string }[] = [
  { id: 'ENTRADA', etiqueta: 'Entrada',  icono: PackagePlus,     pregunta: '¿Cuántas han entrado?' },
  { id: 'MERMA',   etiqueta: 'Merma',    icono: PackageMinus,    pregunta: '¿Cuántas se han perdido?' },
  { id: 'AJUSTE',  etiqueta: 'Recuento', icono: ClipboardCheck,  pregunta: '¿Cuántas hay de verdad?' },
];

const ETIQUETA_TIPO: Record<string, string> = {
  ENTRADA: 'Entrada', MERMA: 'Merma', AJUSTE: 'Recuento',
  VENTA: 'Venta', DEVOLUCION: 'Devolución',
};

export function HojaStock({ productoId, onCerrar, onCambio }: {
  productoId: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<{ nombre: string; stock: number | null; movimientos: MovimientoStock[] } | null>(null);
  const [accion, setAccion] = useState<Accion>('ENTRADA');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [coste, setCoste] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargarStock(productoId).then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (esError(r)) { setError(r.error); return; }
      setError(null);
      setDatos({ nombre: r.producto.nombre, stock: r.producto.stock, movimientos: r.movimientos });
    });
    return () => { vivo = false; };
  }, [productoId, recarga]);

  const refrescar = useCallback(() => setRecarga((n) => n + 1), []);

  async function enviar() {
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 0) { setError('Esa cantidad no es válida.'); return; }
    setEnviando(true);
    setError(null);
    const r = await moverStock({
      productoId, tipo: accion, cantidad: n,
      motivo: motivo.trim() || undefined,
      costeUnitario: accion === 'ENTRADA' && coste.trim() !== '' ? Number(coste) : undefined,
    });
    setEnviando(false);
    if (esError(r)) { setError(r.error); return; }
    setCantidad(''); setMotivo(''); setCoste('');
    refrescar();
    // El panel se entera: el stock que pinta el catálogo del TPV y la lista de
    // productos vienen de otro sitio.
    onCambio();
  }

  const activa = ACCIONES.find((a) => a.id === accion)!;

  return (
    <DashboardSheet
      open onClose={onCerrar} label="Existencias" portal
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      backdropStyle={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      sheetClassName="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <>
        <div className="shrink-0 px-5 py-4 border-b border-border flex items-center gap-2">
          <h2 className="flex-1 text-[17px] font-bold text-foreground truncate">
            {datos?.nombre ?? 'Existencias'}
          </h2>
          <button onClick={onCerrar} aria-label="Cerrar"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cargando && (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          )}

          {!cargando && datos && (
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-background border border-border px-4 py-3 flex items-baseline gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Ahora hay</span>
                <span className="text-[26px] font-extrabold text-foreground tabular-nums">{datos.stock ?? '—'}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ACCIONES.map((a) => (
                  <button key={a.id} onClick={() => { setAccion(a.id); setError(null); }}
                    className={cn(
                      'h-12 rounded-xl border text-[13px] font-semibold inline-flex items-center justify-center gap-1.5',
                      accion === a.id ? 'border-brand bg-brand/10 text-brand' : 'border-border text-foreground',
                    )}>
                    <a.icono size={14} /> {a.etiqueta}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="stk-cantidad" className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">
                  {activa.pregunta}
                </label>
                <input id="stk-cantidad" value={cantidad} inputMode="numeric"
                  onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-12 border border-border rounded-xl px-3 text-[16px] text-foreground outline-none focus:border-brand" />
              </div>

              {accion === 'ENTRADA' && (
                <div>
                  <label htmlFor="stk-coste" className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">
                    Coste por unidad (opcional)
                  </label>
                  <input id="stk-coste" value={coste} inputMode="decimal"
                    onChange={(e) => setCoste(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
                    placeholder="€"
                    className="w-full h-12 border border-border rounded-xl px-3 text-[16px] text-foreground outline-none focus:border-brand" />
                </div>
              )}

              <div>
                <label htmlFor="stk-motivo" className="text-[12px] font-semibold text-muted-foreground mb-1.5 block">
                  Motivo {accion === 'ENTRADA' ? '(opcional)' : ''}
                </label>
                <input id="stk-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder={accion === 'MERMA' ? 'Se rompieron dos botellas' : accion === 'AJUSTE' ? 'Recuento de fin de mes' : 'Pedido del proveedor'}
                  className="w-full h-12 border border-border rounded-xl px-3 text-[15px] text-foreground outline-none focus:border-brand" />
              </div>

              {error && <p className="text-[13px] text-destructive">{error}</p>}

              <button onClick={enviar} disabled={enviando || cantidad === ''}
                className="w-full h-13 py-3.5 rounded-xl bg-brand text-brand-foreground text-[15px] font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {enviando && <Loader2 size={15} className="animate-spin" />}
                {/* Nombre propio, distinto del selector de arriba: «Entrada»
                    en los dos sitios deja al lector de pantalla (y a quien
                    mira) sin saber cuál es el botón que guarda. */}
                {activa.id === 'AJUSTE' ? 'Guardar recuento' : `Guardar ${activa.etiqueta.toLowerCase()}`}
              </button>

              {/* ── Historial ────────────────────────────────────────────── */}
              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Qué ha pasado
                </p>
                {datos.movimientos.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    Todavía no hay movimientos. El stock inicial se puso al crear el artículo.
                  </p>
                )}
                {datos.movimientos.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    <span className={cn(
                      'w-14 text-[15px] font-bold tabular-nums shrink-0',
                      m.cantidad > 0 ? 'text-success' : 'text-destructive',
                    )}>
                      {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-foreground truncate">
                        {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                        {m.detalle && <span className="font-normal text-muted-foreground"> · {m.detalle}</span>}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {new Date(m.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {m.quien && ` · ${m.quien}`}
                      </p>
                    </div>
                    {m.stockResultante != null && (
                      <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">→ {m.stockResultante}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!cargando && !datos && error && (
            <p className="p-8 text-center text-[14px] text-destructive">{error}</p>
          )}
        </div>
      </>
    </DashboardSheet>
  );
}
