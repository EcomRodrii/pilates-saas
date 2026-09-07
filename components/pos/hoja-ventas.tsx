'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ArrowLeft, Loader2, RotateCcw, Receipt } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import { devolverVenta, esError } from '@/lib/pos/cliente';
import { formatNumeroVenta } from '@/lib/pos/tipos';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de ventas y devoluciones.
//
// Cada venta es un registro inmutable: se puede devolver (entera o por línea),
// nunca borrar. Lo que se ve aquí es lo mismo que cuadra con la caja y con la
// factura — no un resumen aparte.
// ─────────────────────────────────────────────────────────────────────────────

interface VentaFila {
  id: string; numero: number; socioId: string | null; total: number;
  metodoPago: string; estado: string; realizadaEn: string;
  vendidoPor: string | null; importeDevuelto: number;
}
interface LineaDetalle {
  id: string; tipo: string; nombre: string; precioUnitario: number; cantidad: number;
  ivaPct: number; descuento: number; total: number; devueltaCantidad: number;
  suscripcionId: string | null;
}
interface Detalle {
  venta: VentaFila & {
    subtotal: number; descuento: number; baseImponible: number; ivaTotal: number;
    pagoEstado: string; devueltaEn: string | null; efectivoRecibido: number | null; cambio: number | null;
  };
  lineas: LineaDetalle[];
}

const METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', DATAFONO: 'Datáfono',
  BIZUM: 'Bizum', TRANSFERENCIA: 'Transferencia',
};

async function pedir<T>(url: string): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { headers: { ...(await authHeader()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as T;
  } catch { return { error: 'No hemos podido conectar.' }; }
}

export function HojaVentas({ onCerrar, onCambio }: { onCerrar: () => void; onCambio: () => void }) {
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);
  // Cuántas unidades de cada línea se van a devolver. Vacío = devolución total.
  const [aDevolver, setADevolver] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<string | null>(null);

  // Contador como dependencia, y el setState dentro de la callback asíncrona:
  // llamar desde el cuerpo del efecto a una función que hace setState encadena
  // renders (regla `set-state-in-effect`).
  const [recarga, setRecarga] = useState(0);
  const cargarLista = useCallback(() => { setCargando(true); setRecarga((n) => n + 1); }, []);

  useEffect(() => {
    let vivo = true;
    pedir<{ ventas: VentaFila[] }>('/api/pos/ventas?limite=50').then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (esError(r)) { setError(r.error); return; }
      setVentas(r.ventas);
    });
    return () => { vivo = false; };
  }, [recarga]);

  async function abrir(id: string) {
    setCargando(true); setError(null); setResultado(null); setADevolver({});
    const r = await pedir<Detalle>(`/api/pos/ventas?id=${encodeURIComponent(id)}`);
    setCargando(false);
    if (esError(r)) { setError(r.error); return; }
    setDetalle(r);
  }

  async function devolver() {
    if (!detalle) return;
    setDevolviendo(true); setError(null);
    const lineas = Object.entries(aDevolver)
      .filter(([, c]) => c > 0)
      .map(([lineaId, cantidad]) => ({ lineaId, cantidad }));
    const r = await devolverVenta({
      ventaId: detalle.venta.id,
      lineas: lineas.length > 0 ? lineas : undefined,
    });
    setDevolviendo(false);
    if (esError(r)) { setError(r.error); return; }
    setResultado(
      r.enEfectivo
        // El libro ya lo apuntó, pero el billete lo saca una persona: decirlo
        // evita el descuadre de "el sistema dice que salió y sigue en el cajón".
        ? `Devuelto ${formatEuro(r.importe)}. Saca el efectivo del cajón.`
        : `Devuelto ${formatEuro(r.importe)} a su tarjeta.`,
    );
    onCambio();
    await abrir(detalle.venta.id);
    cargarLista();
  }

  const pendienteTotal = detalle
    ? Math.max(0, detalle.venta.total - detalle.venta.importeDevuelto)
    : 0;
  const haySeleccion = Object.values(aDevolver).some((c) => c > 0);

  return (
    <DashboardSheet
      open onClose={onCerrar} label="Ventas" portal
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      backdropStyle={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      sheetClassName="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <>
        <div className="shrink-0 px-5 py-4 border-b border-border flex items-center gap-2">
          {detalle ? (
            <button onClick={() => { setDetalle(null); setResultado(null); }} aria-label="Volver" className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background">
              <ArrowLeft size={16} />
            </button>
          ) : <Receipt size={17} className="text-muted-foreground ml-1" />}
          <h2 className="flex-1 text-[17px] font-bold text-foreground">
            {detalle ? `Venta ${formatNumeroVenta(detalle.venta.numero)}` : 'Ventas'}
          </h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cargando && <div className="p-10 flex justify-center"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>}
          {error && <div className="mx-4 mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</div>}
          {resultado && <div className="mx-4 mt-4 rounded-xl bg-success/10 px-4 py-3 text-[13px] text-success">{resultado}</div>}

          {/* ── Lista ────────────────────────────────────────────────────── */}
          {!cargando && !detalle && (
            <div className="px-4 py-2">
              {ventas.length === 0 && <p className="py-10 text-center text-[14px] text-muted-foreground">Todavía no hay ventas.</p>}
              {ventas.map((v) => (
                <button key={v.id} onClick={() => abrir(v.id)}
                  className="w-full flex items-center justify-between gap-3 py-3 border-b border-border last:border-0 text-left hover:bg-background transition-colors rounded-lg px-2">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-foreground">
                      {formatNumeroVenta(v.numero)}
                      {v.importeDevuelto > 0 && (
                        <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                          {v.importeDevuelto >= v.total ? 'Devuelta' : 'Devuelta en parte'}
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {new Date(v.realizadaEn).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{METODO[v.metodoPago] ?? v.metodoPago}
                      {v.vendidoPor && ` · ${v.vendidoPor}`}
                    </p>
                  </div>
                  <span className="text-[15px] font-bold text-foreground tabular-nums shrink-0">{formatEuro(v.total)}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Detalle ──────────────────────────────────────────────────── */}
          {!cargando && detalle && (
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-background border border-border px-4 py-3 text-[13px] space-y-1">
                <Dato label="Cuándo" valor={new Date(detalle.venta.realizadaEn).toLocaleString('es-ES')} />
                <Dato label="Pago" valor={METODO[detalle.venta.metodoPago] ?? detalle.venta.metodoPago} />
                {detalle.venta.vendidoPor && <Dato label="Quién cobró" valor={detalle.venta.vendidoPor} />}
                {detalle.venta.efectivoRecibido != null && (
                  <Dato label="Entregado / cambio" valor={`${formatEuro(detalle.venta.efectivoRecibido)} / ${formatEuro(detalle.venta.cambio ?? 0)}`} />
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Líneas</p>
                {detalle.lineas.map((l) => {
                  const quedan = l.cantidad - l.devueltaCantidad;
                  const sel = aDevolver[l.id] ?? 0;
                  return (
                    <div key={l.id} className="py-2.5 border-b border-border last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium text-foreground">{l.nombre}</p>
                          <p className="text-[12px] text-muted-foreground tabular-nums">
                            {l.cantidad} × {formatEuro(l.precioUnitario)} · IVA {l.ivaPct}%
                            {l.devueltaCantidad > 0 && <span className="text-warning"> · {l.devueltaCantidad} devuelta{l.devueltaCantidad === 1 ? '' : 's'}</span>}
                          </p>
                          {/* La prueba de que el bono del mostrador es un bono real. */}
                          {l.tipo === 'PLAN' && l.suscripcionId && (
                            <p className="text-[11.5px] text-success mt-0.5">✓ En la ficha de la clienta</p>
                          )}
                        </div>
                        <span className="text-[14px] font-bold text-foreground tabular-nums shrink-0">{formatEuro(l.total)}</span>
                      </div>
                      {quedan > 0 && detalle.venta.estado === 'PAGADA' && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground">Devolver</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setADevolver((p) => ({ ...p, [l.id]: Math.max(0, sel - 1) }))}
                              aria-label={`Devolver una unidad menos de ${l.nombre}`}
                              className="w-9 h-9 rounded-lg border border-border text-foreground">−</button>
                            <span className="w-7 text-center text-[14px] font-bold tabular-nums">{sel}</span>
                            <button
                              onClick={() => setADevolver((p) => ({ ...p, [l.id]: Math.min(quedan, sel + 1) }))}
                              aria-label={`Devolver una unidad más de ${l.nombre}`}
                              className="w-9 h-9 rounded-lg border border-border text-foreground">+</button>
                          </div>
                          <span className="text-[11.5px] text-muted-foreground">de {quedan}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-background border border-border px-4 py-3 space-y-1 text-[13.5px]">
                <Dato label="Subtotal" valor={formatEuro(detalle.venta.subtotal)} />
                {detalle.venta.descuento > 0 && <Dato label="Descuento" valor={`−${formatEuro(detalle.venta.descuento)}`} />}
                <Dato label="Base imponible" valor={formatEuro(detalle.venta.baseImponible)} />
                <Dato label="IVA" valor={formatEuro(detalle.venta.ivaTotal)} />
                <div className="flex justify-between pt-1.5 border-t border-border text-[16px] font-bold text-foreground">
                  <span>Total</span><span className="tabular-nums">{formatEuro(detalle.venta.total)}</span>
                </div>
                {detalle.venta.importeDevuelto > 0 && (
                  <div className="flex justify-between text-warning font-semibold">
                    <span>Devuelto</span><span className="tabular-nums">−{formatEuro(detalle.venta.importeDevuelto)}</span>
                  </div>
                )}
              </div>

              {detalle.venta.estado === 'PAGADA' && pendienteTotal > 0 && (
                <button
                  disabled={devolviendo}
                  onClick={devolver}
                  className={cn(
                    'w-full h-14 rounded-xl border-2 text-[15px] font-bold flex items-center justify-center gap-2 transition-colors',
                    'border-destructive/30 bg-destructive/10 text-destructive disabled:opacity-50',
                  )}
                >
                  {devolviendo ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  {haySeleccion ? 'Devolver lo seleccionado' : `Devolver todo (${formatEuro(pendienteTotal)})`}
                </button>
              )}
              {/* Que la factura NO se rectifica sola es una decisión, no un
                  olvido: elegir el tipo de rectificativa necesita criterio de
                  gestoría y vive en /facturas. */}
              {detalle.venta.importeDevuelto > 0 && (
                <p className="text-[12px] text-muted-foreground text-center">
                  La factura no se rectifica sola. Si hace falta, emite la rectificativa desde Facturas.
                </p>
              )}
            </div>
          )}
        </div>
      </>
    </DashboardSheet>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium tabular-nums text-right">{valor}</span>
    </div>
  );
}
