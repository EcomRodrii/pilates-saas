'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Banknote, CreditCard, Smartphone, ArrowRightLeft, Loader2, CheckCircle2,
  XCircle, AlertTriangle, ArrowLeft, Delete, X,
} from 'lucide-react';
import { cn, formatEuro } from '@/lib/utils';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { qrSvgMarkup } from '@/lib/qr-svg';
import { calcularCambio, sugerenciasEfectivo } from '@/lib/pos/ticket';
import { confirmarPago, esError, type RespuestaVenta } from '@/lib/pos/cliente';
import { necesitaAtestiguar, type EstadoPagoPOS } from '@/lib/pos/tipos';
import type { MetodoPago } from '@/lib/types';
import { BotonFactura } from './boton-factura';

// ─────────────────────────────────────────────────────────────────────────────
// El cobro.
//
// ⚠️ Esta pantalla NO decide si se ha cobrado. Solo lo pregunta y lo pinta.
//
// El TPV anterior tenía, en Bizum, un botón «Cobro realizado» que registraba la
// venta como pagada sin consultar a Stripe, y un camino de respaldo que hacía
// lo mismo cuando Stripe ni siquiera respondía. Aquí no existe ningún control
// capaz de escribir «Pagado»: el estado llega SIEMPRE de /api/pos/venta/confirmar,
// que lo lee del proveedor.
//
// La única excepción son efectivo y transferencia, y no es una excepción de
// verdad: ahí no hay tercero al que preguntar, la venta nace cobrada en el
// servidor y esta hoja no la confirma, solo enseña la vuelta.
// ─────────────────────────────────────────────────────────────────────────────

const METODOS: { valor: MetodoPago; label: string; Icono: React.ElementType; ayuda: string }[] = [
  { valor: 'EFECTIVO',      label: 'Efectivo',      Icono: Banknote,       ayuda: 'Cobras en el mostrador' },
  { valor: 'DATAFONO',      label: 'Datáfono',      Icono: CreditCard,     ayuda: 'Se envía al lector' },
  { valor: 'BIZUM',         label: 'Bizum',         Icono: Smartphone,     ayuda: 'Paga desde su móvil' },
  { valor: 'TARJETA',       label: 'Tarjeta',       Icono: CreditCard,     ayuda: 'TPV de tu banco' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia', Icono: ArrowRightLeft, ayuda: 'Ya te la han hecho' },
];

type Fase =
  | { f: 'metodo' }
  | { f: 'efectivo' }
  // Tarjeta del banco y transferencia: nadie externo puede confirmarlas, así
  // que se le pregunta a quien cobra ANTES de dar nada por bueno.
  | { f: 'atestiguar'; metodo: MetodoPago }
  | { f: 'enviando' }
  | { f: 'esperando'; venta: RespuestaVenta; estado: EstadoPagoPOS; url?: string | null }
  // `verificado` = lo confirmó un TERCERO (Stripe), no la persona que cobra.
  // La pantalla de éxito tiene que decir cuál de las dos cosas es: «Cobrado» a
  // secas para un cobro que nadie ha comprobado es la mentira que este
  // rediseño existe para quitar.
  | { f: 'exito'; venta: RespuestaVenta; entrega?: RespuestaVenta['entrega']; verificado: boolean }
  | { f: 'fallo'; mensaje: string };

// El datáfono espera hasta minuto y medio: es lo que tarda alguien en sacar la
// tarjeta, acercarla y teclear el PIN. Menos, y se corta a mitad de un cobro
// legítimo; más, y quien está detrás del mostrador no sabe si seguir esperando.
const ESPERA_MAX_MS = 90_000;
const INTERVALO_MS = 1_500;

export function HojaCobro({
  total, cobroDisponible, onCobrar, onHecho, onCerrar,
}: {
  total: number;
  cobroDisponible: { stripeConectado: boolean; datafonoEmparejado: boolean };
  /** Registra la venta en el servidor. Devuelve lo que respondió. */
  onCobrar: (metodo: MetodoPago, efectivoRecibido: number | null) => Promise<RespuestaVenta | { error: string }>;
  /** La venta quedó cobrada de verdad. Vacía el ticket. */
  onHecho: (venta: RespuestaVenta) => void;
  onCerrar: () => void;
}) {
  const [fase, setFase] = useState<Fase>({ f: 'metodo' });
  const [entregado, setEntregado] = useState('');

  const cambio = calcularCambio(total, parseFloat(entregado.replace(',', '.')) || 0);
  const sugerencias = sugerenciasEfectivo(total);

  // ── Lanzar el cobro ───────────────────────────────────────────────────────
  const lanzar = useCallback(async (m: MetodoPago, efectivo: number | null) => {
    // El estado de carga se enciende ANTES del await, no después: la petición
    // puede tardar segundos (el datáfono, sobre todo) y sin esto la pantalla
    // parece muerta y se pulsa dos veces. Es la misma lección que dejó el
    // captcha invisible.
    setFase({ f: 'enviando' });
    const r = await onCobrar(m, efectivo);
    if (esError(r)) { setFase({ f: 'fallo', mensaje: r.error }); return; }

    if (r.estado === 'PAGADA') {
      // ⚠️ El EFECTIVO también cuenta como verificado, y no es un matiz: el
      // dinero está en el cajón, lo ha contado una persona y el arqueo del
      // cierre lo cuadra. Lo que NO está verificado es lo que se afirma sin
      // que nadie —ni Stripe ni quien cobra— haya visto entrar el dinero
      // aquí: la tarjeta del datáfono del banco y la transferencia.
      setFase({ f: 'exito', venta: r, entrega: r.entrega, verificado: !necesitaAtestiguar(m) });
      return;
    }
    setFase({ f: 'esperando', venta: r, estado: r.pagoEstado, url: r.pago?.url ?? null });
  }, [onCobrar]);

  // ── Esperar al proveedor ──────────────────────────────────────────────────
  // Preguntar en bucle, no confiar en nada local. El servidor relee el
  // PaymentIntent en cada vuelta.
  // Solo depende del ID de la venta en curso, no del objeto `fase` entero: si
  // dependiera de `fase`, cada cambio de estado del pago reiniciaría el bucle
  // y el temporizador de 90 s no llegaría a agotarse nunca.
  const ventaEnCurso = fase.f === 'esperando' ? fase.venta.ventaId : null;

  useEffect(() => {
    if (!ventaEnCurso) return;
    const limite = Date.now() + ESPERA_MAX_MS;
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!vivo) return;
      const r = await confirmarPago(ventaEnCurso);
      if (!vivo) return;

      if (esError(r)) {
        // Un fallo de red al PREGUNTAR no significa que no se haya cobrado.
        // Se sigue intentando hasta agotar el tiempo, en vez de dar el cobro
        // por perdido y arriesgarse a cobrar dos veces.
        if (Date.now() < limite) { temporizador = setTimeout(tick, INTERVALO_MS); return; }
        setFase({ f: 'fallo', mensaje: 'No hemos podido confirmar el cobro. Compruébalo en tu panel de Stripe ANTES de volver a cobrar.' });
        return;
      }

      // Forma funcional en vez de leer un ref durante el render: `prev` es el
      // estado real en el momento de aplicar, sin depender de una copia que
      // pueda haber quedado atrás.
      if (r.estado === 'PAGADA') {
        setFase((prev) => ({
          f: 'exito',
          // A este camino solo se llega sondeando a Stripe, que es quien
          // acaba de decir que sí.
          verificado: true,
          venta: {
            ...(prev.f === 'esperando' ? prev.venta : ({} as RespuestaVenta)),
            ventaId: ventaEnCurso, numero: r.numero, total: r.total,
            estado: 'PAGADA', pagoEstado: 'PAGADO',
          } as RespuestaVenta,
          entrega: r.entrega,
        }));
        return;
      }
      if (r.estado === 'ANULADA') {
        setFase({ f: 'fallo', mensaje: r.motivo || 'El cobro no se ha completado. No se ha cobrado nada.' });
        return;
      }

      if (Date.now() >= limite) {
        // Se agotó la espera. NO se afirma que no se cobró: se dice
        // exactamente lo que sabemos, que es nada, y qué hacer.
        setFase({ f: 'fallo', mensaje: 'Se ha agotado el tiempo de espera. Si la tarjeta llegó a pasarse, la venta aparecerá cobrada en unos segundos — compruébalo antes de volver a cobrar.' });
        return;
      }
      setFase((prev) => (prev.f === 'esperando' && prev.estado !== r.pagoEstado
        ? { ...prev, estado: r.pagoEstado }
        : prev));
      temporizador = setTimeout(tick, INTERVALO_MS);
    };

    temporizador = setTimeout(tick, INTERVALO_MS);
    return () => { vivo = false; clearTimeout(temporizador); };
  }, [ventaEnCurso]);

  async function cancelarEspera() {
    if (fase.f !== 'esperando') return;
    setFase({ f: 'enviando' });
    const r = await confirmarPago(fase.venta.ventaId, 'cancelar');
    // Si entre el clic y la cancelación la tarjeta llegó a pasarse, manda lo
    // que diga Stripe: cancelar no puede deshacer un cobro real.
    if (!esError(r) && r.estado === 'PAGADA') {
      setFase({ f: 'exito', venta: { ...fase.venta, estado: 'PAGADA', pagoEstado: 'PAGADO' }, entrega: r.entrega, verificado: true });
      return;
    }
    setFase({ f: 'metodo' });
  }

  const disponible = (m: MetodoPago) => {
    if (m === 'DATAFONO') return cobroDisponible.datafonoEmparejado;
    if (m === 'BIZUM') return cobroDisponible.stripeConectado;
    return true;
  };

  // Qué significa CERRAR aquí, que no es lo mismo en todas las fases y la
  // diferencia es de dinero:
  //
  //  · Mientras se espera al banco no se cierra. Ya estaba así.
  //  · Tras una venta con ÉXITO, cerrar tiene que hacer lo MISMO que «Nueva
  //    venta»: vaciar el ticket. `onCerrar` no lo vacía, así que salir por ahí
  //    dejaba en pantalla un ticket ya cobrado con su botón «Cobrar» activo, y
  //    la clave de idempotencia intacta (solo se renueva en `vaciar()`). Quien
  //    volviera a pulsar cobraría —a ojos del mostrador— una venta que ya
  //    existía. No era teórico: `Escape` ya cerraba por ahí, sin ningún botón
  //    a la vista que lo insinuara.
  //  · En el resto (elegir método, contar efectivo, fallo) cerrar es abandonar,
  //    y el ticket debe quedarse como está.
  const cerrar =
    fase.f === 'esperando' || fase.f === 'enviando' ? null
      : fase.f === 'exito' ? () => onHecho(fase.venta)
        : onCerrar;

  return (
    <DashboardSheet
      open
      onClose={cerrar ?? (() => {})}
      closeOnBackdropClick={fase.f === 'metodo' || fase.f === 'efectivo'}
      label="Cobrar"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      backdropStyle={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      sheetClassName="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <>
        {/* Cabecera: el total, siempre a la vista y grande. Es el dato que se
            dice en voz alta y el que se comprueba antes de tocar nada. */}
        <div className="relative shrink-0 px-6 pt-6 pb-5 border-b border-border text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total a cobrar</p>
          <p className="mt-1 text-[40px] leading-none font-extrabold text-foreground tabular-nums">{formatEuro(total)}</p>
          {/* Sin esto la única salida de la pantalla de éxito era el botón
              «Nueva venta», que no dice que también sirva para cerrar. 44 px,
              que es el mínimo para un dedo en el iPad del mostrador. */}
          {cerrar && (
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Elegir método ─────────────────────────────────────────────
              Efectivo a lo ancho y el resto en dos columnas: es el método más
              frecuente del mostrador y antes tenía el mismo peso que los
              demás, con «Transferencia» además quedándose huérfana en la
              última fila de una rejilla de cinco. */}
          {fase.f === 'metodo' && (
            <div className="p-4 grid grid-cols-2 gap-3">
              {METODOS.map(({ valor, label, Icono, ayuda }) => {
                const ok = disponible(valor);
                return (
                  <button
                    key={valor}
                    disabled={!ok}
                    onClick={() => {
                      if (valor === 'EFECTIVO') { setEntregado(''); setFase({ f: 'efectivo' }); }
                      else if (necesitaAtestiguar(valor)) setFase({ f: 'atestiguar', metodo: valor });
                      else lanzar(valor, null);
                    }}
                    // 96 px de alto: se pulsa con el pulgar, de pie, sin mirar.
                    className={cn(
                      'h-24 rounded-2xl border-2 flex flex-col items-center justify-center gap-1.5 transition-all',
                      'active:scale-[0.97]',
                      valor === 'EFECTIVO' && 'col-span-2',
                      ok
                        ? 'border-border bg-background hover:border-foreground/40 hover:bg-card'
                        : 'border-border/50 bg-muted/40 opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Icono size={22} className="text-foreground" />
                    <span className="text-[15px] font-semibold text-foreground">{label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {/* Un método apagado tiene que decir QUÉ HACER, no solo
                          que no está. «Sin datáfono emparejado» a alguien que
                          está cobrando le suena a avería. */}
                      {ok
                        ? ayuda
                        : valor === 'DATAFONO'
                          ? 'Empareja uno en Configuración → Integraciones'
                          : 'Conecta Stripe en Configuración → Integraciones'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Atestiguar (tarjeta del banco, transferencia) ────────────
              A Tentare NO le consta este cobro: se hace en el datáfono del
              banco o en la cuenta, fuera de aquí. Antes se registraba como
              «Cobrado» en cuanto se pulsaba el método —el proveedor manual
              devuelve PAGADO al instante— y en pantalla salía idéntico a un
              cobro confirmado por Stripe. Eso es exactamente la transacción
              dada por buena sin que nadie la compruebe.
              Ahora se pide a quien cobra que lo afirme, y queda firmado con su
              nombre en `vendido_por`. */}
          {fase.f === 'atestiguar' && (
            <div className="p-6 space-y-4 text-center">
              <button onClick={() => setFase({ f: 'metodo' })} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft size={14} /> Otro método
              </button>
              <div className="w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
                <AlertTriangle size={26} className="text-warning" />
              </div>
              <p className="text-[17px] font-bold text-foreground">
                {fase.metodo === 'TARJETA'
                  ? '¿Ha aprobado el datáfono de tu banco?'
                  : '¿Te ha llegado la transferencia?'}
              </p>
              <p className="text-[13.5px] text-muted-foreground max-w-[340px] mx-auto">
                {fase.metodo === 'TARJETA'
                  ? `Tentare no ve los cobros del datáfono de tu banco. Confirma que has cobrado ${formatEuro(total)} y lo registramos a tu nombre.`
                  : `Tentare no ve tu cuenta bancaria. Confirma que has recibido ${formatEuro(total)} y lo registramos a tu nombre.`}
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => lanzar(fase.metodo, null)}
                  className="w-full h-14 rounded-xl bg-brand text-brand-foreground text-[16px] font-bold active:scale-[0.99] transition-transform"
                >
                  Sí, he cobrado {formatEuro(total)}
                </button>
                <button
                  onClick={() => setFase({ f: 'metodo' })}
                  className="w-full h-12 rounded-xl text-[14px] font-medium text-muted-foreground"
                >
                  No, todavía no
                </button>
              </div>
            </div>
          )}

          {/* ── Efectivo: cuánto entrega y cuánto se devuelve ───────────── */}
          {fase.f === 'efectivo' && (
            <div className="p-4 space-y-4">
              <button onClick={() => setFase({ f: 'metodo' })} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft size={14} /> Otro método
              </button>

              <div>
                <label htmlFor="pos-entregado" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  ¿Con cuánto paga?
                </label>
                <input
                  id="pos-entregado"
                  inputMode="decimal"
                  autoFocus
                  value={entregado}
                  onChange={(e) => setEntregado(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder={total.toFixed(2)}
                  className="mt-1.5 w-full h-16 rounded-2xl border-2 border-border bg-background px-4 text-[28px] font-bold text-foreground tabular-nums text-center outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    onClick={() => setEntregado(s.toFixed(2))}
                    className="h-14 rounded-xl border border-border bg-background text-[15px] font-semibold text-foreground tabular-nums hover:border-foreground/40 active:scale-[0.97] transition-all"
                  >
                    {s % 1 === 0 ? `${s} €` : formatEuro(s)}
                  </button>
                ))}
              </div>

              {/* La vuelta, en grande. Es lo que hay que contar del cajón. */}
              <div className={cn(
                'rounded-2xl px-5 py-4 flex items-center justify-between',
                cambio.ok ? 'bg-success/10' : 'bg-muted',
              )}>
                <span className="text-[15px] font-semibold text-foreground">
                  {cambio.ok ? 'Cambio' : 'Falta'}
                </span>
                <span className={cn(
                  'text-[30px] leading-none font-extrabold tabular-nums',
                  cambio.ok ? 'text-success' : 'text-muted-foreground',
                )}>
                  {formatEuro(cambio.ok ? cambio.cambio : cambio.falta)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEntregado((v) => v.slice(0, -1))}
                  aria-label="Borrar un dígito"
                  className="h-14 w-16 rounded-xl border border-border text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <Delete size={18} />
                </button>
                <button
                  disabled={!cambio.ok}
                  onClick={() => lanzar('EFECTIVO', parseFloat(entregado.replace(',', '.')) || total)}
                  className="flex-1 h-14 rounded-xl bg-brand text-brand-foreground text-[16px] font-bold disabled:opacity-40 active:scale-[0.99] transition-all"
                >
                  Confirmar pago
                </button>
              </div>
            </div>
          )}

          {/* ── Enviando ────────────────────────────────────────────────── */}
          {fase.f === 'enviando' && (
            <div className="p-10 flex flex-col items-center gap-3 text-center">
              <Loader2 size={30} className="animate-spin text-muted-foreground" />
              <p className="text-[15px] font-semibold text-foreground">Registrando la venta…</p>
            </div>
          )}

          {/* ── Esperando al proveedor ──────────────────────────────────── */}
          {fase.f === 'esperando' && (
            <div className="p-8 flex flex-col items-center gap-4 text-center">
              {fase.url ? (
                <>
                  <p className="text-[16px] font-semibold text-foreground">Que escanee este código</p>
                  <div className="w-44 h-44" dangerouslySetInnerHTML={{ __html: qrSvgMarkup(fase.url) }} />
                  <a href={fase.url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-brand underline">
                    Abrir el enlace de pago
                  </a>
                </>
              ) : (
                <div className="w-20 h-20 rounded-full bg-info/10 flex items-center justify-center">
                  <CreditCard size={32} className="text-info" />
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[17px] font-bold text-foreground flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> {textoEspera(fase.estado, Boolean(fase.url))}
                </p>
                {/* Nunca «Pagado» aquí. Lo que se dice es literalmente lo que
                    sabemos: que estamos esperando a que lo confirme el banco. */}
                <p className="text-[13px] text-muted-foreground max-w-[280px]">
                  Esperando la confirmación del banco. No cierres esta pantalla.
                </p>
              </div>

              <button
                onClick={cancelarEspera}
                className="mt-2 px-5 h-11 rounded-xl border border-border text-[14px] font-medium text-muted-foreground hover:text-foreground"
              >
                Cancelar el cobro
              </button>
            </div>
          )}

          {/* ── Cobrado ─────────────────────────────────────────────────── */}
          {fase.f === 'exito' && (
            <div className="p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in-50 duration-300">
                <CheckCircle2 size={38} className="text-success" />
              </div>
              <p className="text-[20px] font-extrabold text-foreground">
                {fase.verificado ? 'Cobrado' : 'Registrado'}
              </p>
              {/* La diferencia importa y por eso se dice: un cobro que ha
                  confirmado Stripe y uno que ha afirmado quien está en el
                  mostrador no son lo mismo, aunque los dos sean dinero real. */}
              {!fase.verificado && (
                <p className="text-[12.5px] text-muted-foreground max-w-[300px]">
                  Queda anotado a tu nombre. Tentare no ha podido comprobarlo por su cuenta.
                </p>
              )}
              {fase.venta.cambio != null && fase.venta.cambio > 0 && (
                <div className="rounded-2xl bg-success/10 px-6 py-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-success/80">Devuelve</p>
                  <p className="text-[30px] leading-tight font-extrabold text-success tabular-nums">{formatEuro(fase.venta.cambio)}</p>
                </div>
              )}
              {/* Lo que la venta ha desencadenado, dicho en concreto: es la
                  prueba visible de que el TPV no es una caja aparte. */}
              {fase.entrega && (
                <ul className="text-[13px] text-muted-foreground space-y-0.5">
                  {fase.entrega.bonos > 0 && <li>✓ {fase.entrega.bonos === 1 ? 'Bono añadido a su ficha' : `${fase.entrega.bonos} bonos añadidos a su ficha`}</li>}
                  {fase.entrega.creditos > 0 && <li>✓ {fase.entrega.creditos} créditos para la clienta</li>}
                  {fase.entrega.facturaSellada && <li>✓ Factura emitida</li>}
                  {fase.entrega.avisos.map((a) => (
                    <li key={a} className="text-warning">· {a}</li>
                  ))}
                </ul>
              )}
              {/* «¿Me das la factura?» se pregunta AQUÍ, con la clienta
                  delante — no en otra pantalla diez minutos después. */}
              <div className="w-full mt-3">
                <BotonFactura ventaId={fase.venta.ventaId} />
              </div>
              <button
                onClick={() => onHecho(fase.venta)}
                className="mt-2 w-full h-14 rounded-xl bg-brand text-brand-foreground text-[16px] font-bold active:scale-[0.99] transition-all"
              >
                Nueva venta
              </button>
            </div>
          )}

          {/* ── No salió ────────────────────────────────────────────────── */}
          {fase.f === 'fallo' && (
            <div className="p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                {fase.mensaje.includes('comprueb') ? <AlertTriangle size={36} className="text-warning" /> : <XCircle size={36} className="text-destructive" />}
              </div>
              <p className="text-[17px] font-bold text-foreground">No se ha completado el cobro</p>
              <p className="text-[14px] text-muted-foreground max-w-[320px]">{fase.mensaje}</p>
              <div className="flex gap-2 w-full mt-3">
                <button onClick={onCerrar} className="flex-1 h-[52px] rounded-xl border border-border text-[15px] font-medium text-muted-foreground">
                  Cerrar
                </button>
                <button onClick={() => setFase({ f: 'metodo' })} className="flex-1 h-[52px] rounded-xl bg-brand text-brand-foreground text-[15px] font-bold">
                  Probar otra vez
                </button>
              </div>
            </div>
          )}
        </div>

        {fase.f === 'metodo' && (
          <div className="shrink-0 p-4 border-t border-border">
            <button onClick={onCerrar} className="w-full h-12 rounded-xl text-[15px] font-medium text-muted-foreground hover:text-foreground">
              Volver al ticket
            </button>
          </div>
        )}
      </>
    </DashboardSheet>
  );
}

// El estado del proveedor, dicho en el idioma del mostrador. `requires_action`
// no significa nada para quien está cobrando.
function textoEspera(estado: EstadoPagoPOS, esBizum: boolean): string {
  if (esBizum) return estado === 'PROCESANDO' ? 'Pago en curso…' : 'Esperando el pago';
  switch (estado) {
    case 'PROCESANDO': return 'Procesando…';
    case 'PENDIENTE':  return 'Acerca la tarjeta al datáfono';
    default:           return 'Esperando al datáfono';
  }
}
