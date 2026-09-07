'use client';

import { useState, useEffect } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { cargarCaja, abrirCaja, moverCaja, cerrarCaja, esError, type EstadoCaja } from '@/lib/pos/cliente';

// ─────────────────────────────────────────────────────────────────────────────
// La caja: abrirla, mover efectivo a mano y cuadrarla al cerrar.
//
// Lo que antes se llamaba «Cerrar caja» era un modal que sumaba las ventas del
// día. No había fondo, ni recuento, ni diferencia, ni entradas o salidas: si
// alguien sacaba 20 € del cajón para pagar al mensajero, para el sistema no
// había pasado nada. Cuadrar con el banco era imposible.
//
// El saldo esperado lo calcula el servidor sumando el libro; esta pantalla no
// lo deriva por su cuenta. Un segundo cálculo aquí sería un segundo sitio donde
// puede quedar mal.
// ─────────────────────────────────────────────────────────────────────────────

type Vista = 'resumen' | 'abrir' | 'mover' | 'cerrar';

export function HojaCaja({ onCerrar, onCambio }: { onCerrar: () => void; onCambio: () => void }) {
  const [datos, setDatos] = useState<EstadoCaja | null>(null);
  const [vista, setVista] = useState<Vista>('resumen');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formularios
  const [fondo, setFondo] = useState('');
  const [movTipo, setMovTipo] = useState<'ENTRADA' | 'SALIDA'>('SALIDA');
  const [movImporte, setMovImporte] = useState('');
  const [movConcepto, setMovConcepto] = useState('');
  const [contado, setContado] = useState('');
  const [arqueo, setArqueo] = useState<{ esperado: number; contado: number; diferencia: number } | null>(null);

  // Un contador como dependencia en vez de llamar desde el cuerpo del efecto a
  // una función que hace setState: eso es lo que prohíbe `set-state-in-effect`,
  // porque encadena renders.
  const [recarga, setRecarga] = useState(0);
  // El spinner se enciende AQUÍ, en el manejador, no dentro del efecto: el
  // valor inicial ya es `true` para la primera carga, y encenderlo desde el
  // cuerpo del efecto es lo que encadena renders.
  const refrescar = () => { setCargando(true); setRecarga((n) => n + 1); };

  useEffect(() => {
    let vivo = true;
    cargarCaja().then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (esError(r)) { setError(r.error); return; }
      setDatos(r);
      setVista(r.caja ? 'resumen' : 'abrir');
    });
    return () => { vivo = false; };
  }, [recarga]);

  const num = (s: string) => parseFloat(s.replace(',', '.')) || 0;
  const diferenciaPrevia = datos ? num(contado) - datos.esperado : 0;

  async function accion(fn: () => Promise<unknown | { error: string }>, despues?: () => void) {
    setOcupado(true); setError(null);
    const r = await fn();
    setOcupado(false);
    if (r && typeof r === 'object' && 'error' in r) { setError(String(r.error)); return; }
    despues?.();
    onCambio();
    refrescar();
  }

  return (
    <DashboardSheet
      open onClose={onCerrar} label="Caja" portal
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      backdropStyle={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      sheetClassName="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <>
        <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-foreground">Caja</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cargando && <div className="p-10 flex justify-center"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>}

          {error && (
            <div className="mx-4 mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</div>
          )}

          {/* ── Sin caja abierta ─────────────────────────────────────────── */}
          {!cargando && vista === 'abrir' && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[16px] font-bold text-foreground">Abrir caja</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  ¿Cuánto efectivo hay en el cajón para empezar? Es el punto de partida del arqueo de hoy.
                </p>
              </div>
              <input
                inputMode="decimal" autoFocus value={fondo}
                onChange={(e) => setFondo(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                className="w-full h-16 rounded-2xl border-2 border-border bg-background px-4 text-[28px] font-bold text-foreground tabular-nums text-center outline-none focus:border-foreground"
              />
              <button
                disabled={ocupado}
                onClick={() => accion(() => abrirCaja(num(fondo)))}
                className="w-full h-14 rounded-xl bg-brand text-brand-foreground text-[16px] font-bold disabled:opacity-50"
              >
                {ocupado ? 'Abriendo…' : 'Abrir caja'}
              </button>
            </div>
          )}

          {/* ── Resumen ──────────────────────────────────────────────────── */}
          {!cargando && datos?.caja && vista === 'resumen' && (
            <div className="p-4 space-y-4">
              <div className="rounded-2xl bg-background border border-border px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debería haber en el cajón</p>
                <p className="text-[34px] leading-tight font-extrabold text-foreground tabular-nums">{formatEuro(datos.esperado)}</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Fondo {formatEuro(datos.caja.fondoInicial)} · abierta por {datos.caja.abiertaPor ?? '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setMovTipo('ENTRADA'); setVista('mover'); }} className="h-14 rounded-xl border border-border bg-background text-[14px] font-semibold text-foreground flex items-center justify-center gap-2 hover:border-foreground/40">
                  <ArrowDownLeft size={16} /> Meter dinero
                </button>
                <button onClick={() => { setMovTipo('SALIDA'); setVista('mover'); }} className="h-14 rounded-xl border border-border bg-background text-[14px] font-semibold text-foreground flex items-center justify-center gap-2 hover:border-foreground/40">
                  <ArrowUpRight size={16} /> Sacar dinero
                </button>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Movimientos</p>
                <div className="space-y-1">
                  {datos.movimientos.slice(0, 30).map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-foreground truncate">{m.concepto}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {new Date(m.creadoEn).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          {m.metodoPago !== 'EFECTIVO' && ` · ${m.metodoPago.toLowerCase()}`}
                          {m.creadoPor && ` · ${m.creadoPor}`}
                        </p>
                      </div>
                      <span className={cn(
                        'text-[14px] font-bold tabular-nums shrink-0',
                        m.importe < 0 ? 'text-destructive' : m.metodoPago === 'EFECTIVO' ? 'text-success' : 'text-muted-foreground',
                      )}>
                        {m.importe > 0 ? '+' : ''}{formatEuro(m.importe)}
                      </span>
                    </div>
                  ))}
                  {datos.movimientos.length === 0 && (
                    <p className="text-[13px] text-muted-foreground py-4 text-center">Todavía no hay movimientos.</p>
                  )}
                </div>
              </div>

              <button onClick={() => { setContado(''); setArqueo(null); setVista('cerrar'); }} className="w-full h-14 rounded-xl border-2 border-foreground/20 bg-foreground/[0.04] text-[15px] font-bold text-foreground">
                Cerrar caja y cuadrar
              </button>
            </div>
          )}

          {/* ── Entrada / salida ─────────────────────────────────────────── */}
          {!cargando && vista === 'mover' && (
            <div className="p-6 space-y-4">
              <p className="text-[16px] font-bold text-foreground">
                {movTipo === 'ENTRADA' ? 'Meter dinero en la caja' : 'Sacar dinero de la caja'}
              </p>
              <input
                inputMode="decimal" autoFocus value={movImporte}
                onChange={(e) => setMovImporte(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                className="w-full h-16 rounded-2xl border-2 border-border bg-background px-4 text-[28px] font-bold text-foreground tabular-nums text-center outline-none focus:border-foreground"
              />
              <input
                value={movConcepto}
                onChange={(e) => setMovConcepto(e.target.value)}
                placeholder="¿De qué es? Ej. pago al mensajero"
                className="w-full h-14 rounded-xl border border-border bg-background px-4 text-[15px] text-foreground outline-none focus:border-foreground"
              />
              <div className="flex gap-2">
                <button onClick={() => setVista('resumen')} className="flex-1 h-14 rounded-xl border border-border text-[15px] font-medium text-muted-foreground">
                  Cancelar
                </button>
                <button
                  disabled={ocupado || num(movImporte) <= 0 || !movConcepto.trim()}
                  onClick={() => accion(
                    () => moverCaja({ tipo: movTipo, importe: num(movImporte), concepto: movConcepto.trim() }),
                    () => { setMovImporte(''); setMovConcepto(''); setVista('resumen'); },
                  )}
                  className="flex-1 h-14 rounded-xl bg-brand text-brand-foreground text-[15px] font-bold disabled:opacity-40"
                >
                  Apuntar
                </button>
              </div>
              {/* Un movimiento no se borra: se compensa con otro. Decirlo aquí
                  evita que alguien lo busque y se frustre. */}
              <p className="text-[12px] text-muted-foreground text-center">
                Los movimientos no se borran. Si te equivocas, apunta el contrario.
              </p>
            </div>
          )}

          {/* ── Cierre ───────────────────────────────────────────────────── */}
          {!cargando && datos?.caja && vista === 'cerrar' && !arqueo && (
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[16px] font-bold text-foreground">Cuenta el efectivo</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Cuenta lo que hay de verdad en el cajón. Si no cuadra, no pasa nada: queda apuntado.
                </p>
              </div>
              <input
                inputMode="decimal" autoFocus value={contado}
                onChange={(e) => setContado(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
                className="w-full h-16 rounded-2xl border-2 border-border bg-background px-4 text-[28px] font-bold text-foreground tabular-nums text-center outline-none focus:border-foreground"
              />
              <div className="rounded-2xl bg-background border border-border px-5 py-3 space-y-1.5 text-[14px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Debería haber</span><span className="tabular-nums">{formatEuro(datos.esperado)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Has contado</span><span className="tabular-nums">{formatEuro(num(contado))}</span>
                </div>
                <div className={cn(
                  'flex justify-between pt-1.5 border-t border-border font-bold',
                  Math.abs(diferenciaPrevia) < 0.005 ? 'text-foreground' : diferenciaPrevia > 0 ? 'text-info' : 'text-destructive',
                )}>
                  <span>Diferencia</span>
                  <span className="tabular-nums">{diferenciaPrevia > 0 ? '+' : ''}{formatEuro(diferenciaPrevia)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setVista('resumen')} className="flex-1 h-14 rounded-xl border border-border text-[15px] font-medium text-muted-foreground">
                  Volver
                </button>
                <button
                  disabled={ocupado || !contado}
                  onClick={() => accion(async () => {
                    const r = await cerrarCaja(num(contado));
                    if (!esError(r)) setArqueo(r);
                    return r;
                  })}
                  className="flex-1 h-14 rounded-xl bg-brand text-brand-foreground text-[15px] font-bold disabled:opacity-40"
                >
                  Cerrar caja
                </button>
              </div>
            </div>
          )}

          {arqueo && (
            <div className="p-8 text-center space-y-3">
              <p className="text-[18px] font-extrabold text-foreground">Caja cerrada</p>
              <div className="rounded-2xl bg-background border border-border px-5 py-4 space-y-1.5 text-[14px] text-left">
                <div className="flex justify-between text-muted-foreground"><span>Esperado</span><span className="tabular-nums">{formatEuro(arqueo.esperado)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Contado</span><span className="tabular-nums">{formatEuro(arqueo.contado)}</span></div>
                <div className={cn('flex justify-between pt-1.5 border-t border-border font-bold',
                  Math.abs(arqueo.diferencia) < 0.005 ? 'text-success' : arqueo.diferencia > 0 ? 'text-info' : 'text-destructive')}>
                  <span>Diferencia</span>
                  <span className="tabular-nums">{arqueo.diferencia > 0 ? '+' : ''}{formatEuro(arqueo.diferencia)}</span>
                </div>
              </div>
              <button onClick={onCerrar} className="w-full h-14 rounded-xl bg-brand text-brand-foreground text-[16px] font-bold">Hecho</button>
            </div>
          )}
        </div>
      </>
    </DashboardSheet>
  );
}
