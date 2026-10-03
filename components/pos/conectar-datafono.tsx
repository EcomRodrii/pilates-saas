'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, CreditCard, ExternalLink, Loader2, MapPin, Store, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { conectarDatafono, esErrorDatafono } from '@/lib/pos/datafono-cliente';
import {
  ETIQUETA_POR_DEFECTO, MENSAJE_CODIGO_MAL_ESCRITO, direccionValida, normalizarCodigo,
  type DireccionLector, type LectorDatafono,
} from '@/lib/pos/datafono';

// ─────────────────────────────────────────────────────────────────────────────
// «Conectar datáfono»: tres pasos y se vuelve a donde se estaba.
//
//   1. ¿Lo tienes? — si no, dónde se compra y lo que cuesta (dicho una vez).
//   2. Las tres palabras que enseña el datáfono, cómo lo llamas y dónde está.
//   3. Listo.
//
// Se abre desde la Caja (el botón «Conectar datáfono» de la hoja de cobro o de
// la deuda de una clienta) y desde Configuración. Desde la Caja, la venta que se
// estaba cobrando sigue ahí al volver: este paso a paso no la toca.
//
// La dirección es la del estudio. Si no la tiene, se pide aquí (Stripe la exige)
// y el servidor la guarda también en el estudio, solo porque le faltaba.
// ─────────────────────────────────────────────────────────────────────────────

/** La tienda de lectores de la cuenta de Stripe del estudio (cuentas Standard: tienen su panel). */
const TIENDA_STRIPE = 'https://dashboard.stripe.com/terminal/shop';

type Paso = 'tienes' | 'comprar' | 'codigo' | 'hecho';
type Fallo = { donde: 'codigo' | 'direccion' | 'general'; texto: string };

const boton = 'inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-5 text-[15px] font-semibold transition-colors disabled:opacity-60';
const principal = cn(boton, 'bg-brand text-brand-foreground');
const secundario = cn(boton, 'border border-border bg-card text-foreground hover:border-foreground/30');
const campo = 'mt-1.5 w-full min-h-12 rounded-xl border bg-background px-3.5 text-[16px] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function ConectarDatafono({ direccionEstudio: direccionServidor, esTest, textoVolver, textoFinal, onConectado, onCerrar }: {
  /** La que dio el servidor; sin ella (aún sin respuesta), la del estudio cargado. */
  direccionEstudio: DireccionLector | null;
  esTest: boolean;
  /** «Volver al cobro» desde la Caja; «Volver» desde Configuración. */
  textoVolver: string;
  /** El botón del último paso: «Volver a cobrar 45,00 €», o «Hecho». */
  textoFinal: string;
  /** Recién conectado: el padre ya puede pintar el botón como «listo». */
  onConectado: (lector: LectorDatafono) => void;
  onCerrar: () => void;
}) {
  const { studio } = useStudio();
  const direccionEstudio = direccionServidor
    ?? direccionValida({ linea: studio?.direccion, codigoPostal: studio?.codigoPostal, ciudad: studio?.ciudad });
  const [paso, setPaso] = useState<Paso>('tienes');
  const [codigo, setCodigo] = useState(esTest ? 'simulated-wpe' : '');
  const [nombre, setNombre] = useState(ETIQUETA_POR_DEFECTO);
  const [editandoDireccion, setEditandoDireccion] = useState(!direccionEstudio);
  const [linea, setLinea] = useState(direccionEstudio?.linea ?? '');
  const [codigoPostal, setCodigoPostal] = useState(direccionEstudio?.codigoPostal ?? '');
  const [ciudad, setCiudad] = useState(direccionEstudio?.ciudad ?? '');
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [lector, setLector] = useState<LectorDatafono | null>(null);
  const enVuelo = useRef(false);

  async function conectar() {
    if (enVuelo.current) return;
    const limpio = esTest ? (normalizarCodigo(codigo) ?? 'simulated-wpe') : normalizarCodigo(codigo);
    if (!limpio) { setFallo({ donde: 'codigo', texto: MENSAJE_CODIGO_MAL_ESCRITO }); return; }
    let direccion: DireccionLector | null = null;
    if (editandoDireccion) {
      direccion = direccionValida({ linea, codigoPostal, ciudad });
      if (!direccion) {
        setFallo({ donde: 'direccion', texto: 'Escribe la calle y el número, un código postal de 5 cifras y la ciudad.' });
        return;
      }
    }
    // El estado de carga ANTES del await: Stripe tarda, y sin él se pulsa dos veces.
    enVuelo.current = true;
    setEnviando(true);
    setFallo(null);
    const r = await conectarDatafono({ codigo: limpio, nombre, direccion });
    enVuelo.current = false;
    setEnviando(false);
    if (esErrorDatafono(r)) {
      if (r.falta === 'direccion') setEditandoDireccion(true);
      setFallo({ donde: r.falta === 'codigo' ? 'codigo' : r.falta === 'direccion' ? 'direccion' : 'general', texto: r.error });
      return;
    }
    setLector(r.lector);
    onConectado(r.lector);
    setPaso('hecho');
  }

  const cabecera = (titulo: string, numero?: number) => (
    <div className="relative shrink-0 border-b border-border px-6 pt-4 pb-4">
      <div className="flex min-h-11 items-center gap-2 pr-12">
        <button type="button" onClick={paso === 'comprar' || paso === 'codigo' ? () => { setFallo(null); setPaso('tienes'); } : onCerrar}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-[13.5px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} aria-hidden /> {paso === 'comprar' || paso === 'codigo' ? 'Atrás' : textoVolver}
        </button>
        {numero && <span className="ml-auto text-[12.5px] font-medium tabular-nums text-muted-foreground">{numero} de 3</span>}
      </div>
      <h2 className="mt-1 text-[20px] font-bold tracking-tight text-foreground text-balance">{titulo}</h2>
      <button type="button" onClick={onCerrar} aria-label="Cerrar"
        className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
        <X size={18} aria-hidden />
      </button>
    </div>
  );

  return (
    <DashboardSheet
      open
      onClose={enviando ? () => {} : onCerrar}
      closeOnBackdropClick={false}
      label="Conectar datáfono"
      portal
      backdropClassName="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      backdropStyle={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      sheetClassName="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <>
        {paso === 'tienes' && (
          <>
            {cabecera('Conecta tu datáfono', 1)}
            <div className="overflow-y-auto px-6 py-5">
              <p className="text-[14px] text-muted-foreground text-pretty">
                Con el datáfono conectado, el cobro llega solo: lo mandas desde aquí, la clienta pasa la tarjeta y la
                venta queda cobrada. Sin teclear el importe dos veces.
              </p>
              <div className="mt-4 space-y-3">
                <Opcion icono={CreditCard} titulo="Sí, lo tengo aquí" texto="Un datáfono de Stripe: Stripe Reader S700 o BBPOS WisePOS E."
                  onClick={() => setPaso('codigo')} />
                <Opcion icono={Store} titulo="Todavía no lo tengo" texto="Te decimos dónde se compra y lo que cuesta."
                  onClick={() => setPaso('comprar')} />
              </div>
            </div>
          </>
        )}

        {paso === 'comprar' && (
          <>
            {cabecera('Cómo conseguir el datáfono', 1)}
            <div className="overflow-y-auto px-6 py-5">
              <p className="text-[14px] text-foreground text-pretty">
                Se compra en <strong className="font-semibold">tu cuenta de Stripe</strong> (la que ya usas para los cobros
                con tarjeta) y te llega a casa. Valen estos dos:
              </p>
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
                <Modelo nombre="Stripe Reader S700" detalle="Pantalla grande, wifi o cable" />
                <Modelo nombre="BBPOS WisePOS E" detalle="Más pequeño, wifi" />
              </ul>
              <p className="mt-4 rounded-xl bg-muted/60 px-3.5 py-3 text-[13.5px] text-foreground text-pretty">
                <strong className="font-semibold">Lo que cuesta cobrar:</strong> Stripe se queda un 1,4 % + 0,10 € de cada
                cobro con tarjeta europea (en 45 €, 0,73 €). El datáfono de tu banco suele cobrar menos por operación; a
                cambio, aquí no tecleas nada y cada cobro queda apuntado solo.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-6 py-4">
              <button type="button" className={secundario} onClick={() => setPaso('codigo')}>Ya lo tengo</button>
              <a href={TIENDA_STRIPE} target="_blank" rel="noopener noreferrer" className={principal}>
                Abrir la tienda de Stripe <ExternalLink size={15} aria-hidden />
              </a>
            </div>
          </>
        )}

        {paso === 'codigo' && (
          <>
            {cabecera('Escribe el código que enseña el datáfono', 2)}
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => { e.preventDefault(); void conectar(); }}
            >
              <div className="overflow-y-auto px-6 py-5">
                {esTest ? (
                  <p className="rounded-xl bg-info/10 px-3.5 py-3 text-[13.5px] text-foreground text-pretty">
                    Estás en el modo de prueba de Stripe: se conecta un datáfono de prueba y el código da igual.
                  </p>
                ) : (
                  <ol className="space-y-2 text-[13.5px] text-foreground">
                    <li className="flex gap-2"><strong className="font-semibold tabular-nums">1.</strong><span>Enciéndelo y conéctalo al wifi del estudio.</span></li>
                    <li className="flex gap-2"><strong className="font-semibold tabular-nums">2.</strong><span>Desliza desde el borde izquierdo de su pantalla y entra en <strong className="font-semibold">Ajustes</strong>. Si te pide una clave, es <strong className="font-semibold tabular-nums">07139</strong>.</span></li>
                    <li className="flex gap-2"><strong className="font-semibold tabular-nums">3.</strong><span>Pulsa <strong className="font-semibold">Generar código de emparejamiento</strong>. Salen tres palabras.</span></li>
                  </ol>
                )}

                <label className="mt-5 block">
                  <span className="text-[13px] font-medium text-foreground">Las tres palabras</span>
                  <input
                    value={codigo}
                    onChange={(e) => { setCodigo(e.target.value); if (fallo?.donde === 'codigo') setFallo(null); }}
                    placeholder="sepia-cerulean-aqua"
                    autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    aria-invalid={fallo?.donde === 'codigo'}
                    aria-describedby={fallo?.donde === 'codigo' ? 'fallo-codigo' : undefined}
                    className={cn(campo, 'font-mono', fallo?.donde === 'codigo' ? 'border-destructive' : 'border-border')}
                  />
                  {fallo?.donde === 'codigo' && <span id="fallo-codigo" role="alert" className="mt-1.5 block text-[13px] font-medium text-destructive text-pretty">{fallo.texto}</span>}
                </label>

                <label className="mt-4 block">
                  <span className="text-[13px] font-medium text-foreground">Cómo lo llamas</span>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40}
                    className={cn(campo, 'border-border')} />
                  <span className="mt-1.5 block text-[12.5px] text-muted-foreground">Para saber cuál es si algún día tienes dos.</span>
                </label>

                <div className="mt-4">
                  {editandoDireccion ? (
                    <div className={cn('space-y-3 rounded-xl border p-3.5', fallo?.donde === 'direccion' ? 'border-destructive/50' : 'border-border')}>
                      <p className="flex items-start gap-2 text-[13.5px] text-foreground text-pretty">
                        <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
                        {direccionEstudio
                          ? 'Dónde está el datáfono. Stripe la pide para registrarlo.'
                          : 'Stripe pide dónde está el datáfono y tu estudio no tiene la dirección puesta. La guardamos también en tu estudio.'}
                      </p>
                      <Campo etiqueta="Dirección" valor={linea} onChange={setLinea} placeholder="Calle y número" autoComplete="street-address" />
                      <div className="grid grid-cols-[130px_1fr] gap-3">
                        <Campo etiqueta="Código postal" valor={codigoPostal} onChange={setCodigoPostal} placeholder="28010" inputMode="numeric" autoComplete="postal-code" />
                        <Campo etiqueta="Ciudad" valor={ciudad} onChange={setCiudad} placeholder="Madrid" autoComplete="address-level2" />
                      </div>
                      {fallo?.donde === 'direccion' && <p role="alert" className="text-[13px] font-medium text-destructive text-pretty">{fallo.texto}</p>}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-3.5 py-3">
                      <MapPin size={17} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-muted-foreground">Dónde está (la dirección de tu estudio)</p>
                        <p className="text-[14px] font-medium text-foreground">{direccionEstudio?.linea}, {direccionEstudio?.codigoPostal} {direccionEstudio?.ciudad}</p>
                      </div>
                      <button type="button" onClick={() => setEditandoDireccion(true)}
                        className="-my-2 min-h-11 rounded-xl px-2 text-[13.5px] font-semibold text-foreground underline underline-offset-2">
                        Cambiar
                      </button>
                    </div>
                  )}
                </div>

                {fallo?.donde === 'general' && (
                  <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3.5 py-3 text-[13.5px] font-medium text-destructive text-pretty">{fallo.texto}</p>
                )}
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
                <button type="button" className={cn(secundario, 'flex-1 sm:flex-none')} onClick={onCerrar} disabled={enviando}>Cancelar</button>
                <button type="submit" className={cn(principal, 'flex-1 sm:flex-none sm:min-w-[140px]')} disabled={enviando}>
                  {enviando ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Conectando…</> : 'Conectar'}
                </button>
              </div>
            </form>
          </>
        )}

        {paso === 'hecho' && lector && (
          <>
            <div className="flex shrink-0 justify-end px-3 pt-3">
              <button type="button" onClick={onCerrar} aria-label="Cerrar"
                className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="flex flex-col items-center px-6 pb-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-success/10 animate-in zoom-in-50 duration-300">
                <Check size={36} className="text-success" aria-hidden />
              </div>
              <p className="mt-4 text-[20px] font-bold text-foreground">Datáfono conectado</p>
              <p className="mt-1.5 max-w-[340px] text-[14px] text-muted-foreground text-pretty">
                <strong className="font-semibold text-foreground">{lector.etiqueta}</strong> está listo. A partir de ahora,
                cuando cobres en la Caja, elige <strong className="font-semibold text-foreground">Datáfono</strong> y el
                importe aparece en su pantalla.
              </p>
            </div>
            <div className="shrink-0 border-t border-border px-6 py-4">
              <button type="button" className={cn(principal, 'w-full')} onClick={onCerrar}>{textoFinal}</button>
            </div>
          </>
        )}
      </>
    </DashboardSheet>
  );
}

function Opcion({ icono: Icono, titulo, texto, onClick }: { icono: typeof Store; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-20 w-full items-center gap-4 rounded-2xl border-2 border-border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40 active:scale-[0.99]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><Icono size={20} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-semibold text-foreground">{titulo}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground text-pretty">{texto}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function Modelo({ nombre, detalle }: { nombre: string; detalle: string }) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <CreditCard size={18} className="shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1">
        <span className="block text-[14px] font-semibold text-foreground">{nombre}</span>
        <span className="text-[12.5px] text-muted-foreground">{detalle}</span>
      </span>
    </li>
  );
}

function Campo({ etiqueta, valor, onChange, placeholder, inputMode, autoComplete }: {
  etiqueta: ReactNode; valor: string; onChange: (v: string) => void; placeholder?: string;
  inputMode?: 'numeric'; autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-foreground">{etiqueta}</span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        inputMode={inputMode} autoComplete={autoComplete} className={cn(campo, 'border-border')} />
    </label>
  );
}
