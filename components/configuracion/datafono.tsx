'use client';

import { useState } from 'react';
import { ChevronRight, Link2, Loader2, MapPin, Store, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resumenDatafono } from '@/lib/configuracion/resumenes';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { desconectarCuentaSumup, desconectarDatafono, esErrorDatafono, renombrarDatafono } from '@/lib/pos/datafono-cliente';
import { normalizarEtiqueta } from '@/lib/pos/datafono';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/configuracion/estilos';
import { FILA, IconoFila } from '@/components/configuracion/shell/fila-herramienta';
import { TituloFila, ValorFila } from '@/components/configuracion/shell/fila-ajuste';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import type { useDatafono } from '@/components/pos/use-datafono';

// ─────────────────────────────────────────────────────────────────────────────
// «Datáfono», en Cobros y facturas: el datáfono del mostrador (el de Stripe o un
// SumUp Solo).
//
// Se conecta desde la Caja (el botón «Conectar datáfono» de la hoja de cobro) o
// desde aquí; aquí además se ve si está encendido, se renombra, se cambia por
// otro y se desconecta, y con SumUp, qué cuenta está conectada. Sin Stripe ni
// SumUp para el estudio no hay nada que hacer: la fila lo dice y no se abre. El
// paso a paso es el mismo componente que en la Caja.
// ─────────────────────────────────────────────────────────────────────────────

type Datafono = ReturnType<typeof useDatafono>;

export function FilaDatafono({ d, stripeConectado, onAbrir, onConectar }: {
  d: Datafono; stripeConectado: boolean; onAbrir: () => void; onConectar: () => void;
}) {
  const tarjeta = tarjetaPorId('datafono');
  const e = d.estado;
  const resumen = resumenDatafono(e
    ? { stripeConectado: stripeConectado && e.stripeConectado, sumupDisponible: e.sumup.disponible, proveedor: e.proveedor, emparejado: e.emparejado, lector: e.lector }
    : stripeConectado ? null : { stripeConectado: false, emparejado: false, lector: null });
  const texto = (
    <span className="min-w-0 flex-1">
      <TituloFila titulo={tarjeta.titulo} estado={resumen.estado} />
      <ValorFila valor={resumen.valor} descripcion={tarjeta.frase} entero />
    </span>
  );
  const conectado = !!e && e.lector !== null && e.emparejado !== false && (e.proveedor === 'sumup' || stripeConectado);

  if (conectado) {
    return (
      <li>
        <button id="datafono" type="button" aria-haspopup="dialog" onClick={onAbrir}
          className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}>
          <IconoFila icono={Store} />
          {texto}
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </li>
    );
  }
  return (
    <li id="datafono" className="flex min-h-16 scroll-mt-32 scroll-mb-32 items-center gap-3 px-4 py-3">
      <IconoFila icono={Store} />
      {texto}
      {e && (stripeConectado || e.sumup.disponible) && (
        <button type="button" onClick={onConectar} className={cn(btnPrimary, 'shrink-0')}>Conectar</button>
      )}
    </li>
  );
}

/** El cajón con el datáfono conectado: cómo está, su nombre, cambiarlo y desconectarlo. */
export function DetalleDatafono({ d, onCambiar, onGuardado }: {
  d: Datafono; onCambiar: () => void;
} & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const lector = d.estado?.lector ?? null;
  const deSumup = d.estado?.proveedor === 'sumup';
  // La dirección solo la pide Stripe; el Solo no la usa.
  const direccion = deSumup ? null : d.estado?.direccion ?? null;
  const cuenta = deSumup ? d.estado?.sumup.cuenta ?? null : null;
  const puedeDesconectarCuenta = deSumup && !!d.estado?.sumup.puedeConectarCuenta;
  const [preguntandoCuenta, setPreguntandoCuenta] = useState(false);
  const [desconectandoCuenta, setDesconectandoCuenta] = useState(false);
  const [nombre, setNombre] = useState(lector?.etiqueta ?? '');
  const [guardando, setGuardando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreCambiado = !!lector && normalizarEtiqueta(nombre) !== lector.etiqueta;

  async function guardarNombre() {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const r = await renombrarDatafono(nombre);
    setGuardando(false);
    if (esErrorDatafono(r)) { setError(r.error); return; }
    d.ponerLector(r.lector);
    onGuardado('Nombre del datáfono guardado');
  }

  async function desconectarCuenta() {
    setDesconectandoCuenta(true);
    setError(null);
    const r = await desconectarCuentaSumup();
    setDesconectandoCuenta(false);
    if (esErrorDatafono(r)) { setError(r.error); return; }
    d.ponerLector(null);
    d.recargar();
    onGuardado('Cuenta de SumUp desconectada');
  }

  async function desconectar() {
    setDesconectando(true);
    setError(null);
    const r = await desconectarDatafono();
    setDesconectando(false);
    if (esErrorDatafono(r)) { setError(r.error); return; }
    d.ponerLector(null);
    onGuardado('Datáfono desconectado');
  }

  const sinConexion = lector?.estado === 'offline';
  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-start gap-3">
        {sinConexion
          ? <WifiOff size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          : <Wifi size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {!lector ? 'No hemos podido ver si está encendido'
              : sinConexion ? `${lector.etiqueta} no responde` : `${lector.etiqueta} está listo`}
          </p>
          <p className="text-[13px] text-muted-foreground text-pretty">
            {sinConexion
              ? (deSumup ? 'Comprueba que está encendido y con conexión (wifi o datos).' : 'Comprueba que está encendido y conectado al wifi del estudio.')
              : lector?.modelo ?? (deSumup ? 'SumUp Solo' : 'Datáfono de Stripe')}
          </p>
          <button type="button" onClick={d.recargar} disabled={d.comprobando}
            className="mt-1 -ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-foreground underline underline-offset-2 disabled:opacity-60">
            {d.comprobando && <Loader2 size={14} className="animate-spin" aria-hidden />}
            Volver a comprobar
          </button>
        </div>
      </div>

      {lector && (
        <div>
          <label htmlFor="datafono-nombre" className={labelCls}>Cómo lo llamas</label>
          <div className="flex gap-2">
            <input id="datafono-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={40} className={inputCls} />
            <button type="button" onClick={() => void guardarNombre()} disabled={!nombreCambiado || guardando} className={cn(btnPrimary, 'shrink-0')}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {direccion && (
        <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
          <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-[12.5px] text-muted-foreground">Dónde está (la dirección de tu estudio)</p>
            <p className="text-sm text-foreground">{direccion.linea}, {direccion.codigoPostal} {direccion.ciudad}</p>
          </div>
        </div>
      )}

      {deSumup && (
        <div className="flex items-start gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
          <Link2 size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-muted-foreground">Cuenta de SumUp</p>
            <p className="text-sm text-foreground">{cuenta?.comercio ?? 'Conectada'}</p>
          </div>
          {puedeDesconectarCuenta && (
            <button type="button" onClick={() => setPreguntandoCuenta(true)} disabled={desconectandoCuenta}
              className="-my-1.5 min-h-10 shrink-0 rounded-lg px-2 text-[13px] font-semibold text-destructive disabled:opacity-60">
              {desconectandoCuenta ? 'Desconectando…' : 'Desconectar'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onCambiar} className={btnSecondary}>Cambiar de datáfono</button>
        <button type="button" onClick={() => setPreguntando(true)} disabled={desconectando} className={cn(btnSecondary, 'text-destructive')}>
          {desconectando ? 'Desconectando…' : 'Desconectar el datáfono'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo="¿Desconectar el datáfono?"
        descripcion="Hasta que conectes otro, en la Caja no podrás cobrar con datáfono. Los cobros ya hechos no cambian."
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void desconectar(); }}
      />
      <ConfirmDialog
        open={preguntandoCuenta}
        onOpenChange={setPreguntandoCuenta}
        titulo="¿Desconectar la cuenta de SumUp?"
        descripcion="Dejarás de poder cobrar con el Solo desde la Caja. Los cobros ya hechos no cambian y el dinero sigue en tu cuenta de SumUp."
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void desconectarCuenta(); }}
      />
    </div>
  );
}
