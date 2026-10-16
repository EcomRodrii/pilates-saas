'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonVivo } from '@/components/dashboard/vivo';
import { unirGrupos } from '@/lib/widgets/en-tu-web';
import { FOCO, TACTIL } from '../piezas';
import { ConfirmarEstiloEnTuWeb } from '../estilo-web';
import type { ConstructorWidgets } from '../usar-constructor';
import type { BarraPublicar as Barra } from './usar-publicar-en-mi-web';

// La barra única «Publicar en mi web» («Tu web» v2, decisión 1): pegada abajo,
// en la portada y en los pasos, SOLO cuando hay algo pendiente, algo que decir
// o se está publicando. Sustituye a la barra de aplicar el estilo, a la región
// «Cambios sin aplicar», a la línea de guardado y al aviso de cabecera.
//
// El botón lleva el degradado de lo destacado (su cuarto sitio, decisión 1).
// Lo que se publica y cómo, en ./usar-publicar-en-mi-web.ts.

export function BarraPublicarEnMiWeb({ s, barra }: { s: ConstructorWidgets; barra: Barra }) {
  const { estiloWeb } = s;
  const propietaria = s.rol === 'PROPIETARIO';
  const publicando = barra.fase === 'publicando';
  const { pendientes } = barra;
  // Lo que no se ha guardado de lo de aquí (su borrador en `widget_builder`) no
  // se calla, pero en voz baja: el código que copie sigue valiendo.
  const sinGuardar = s.guardado === 'error';
  // Un fallo de Deshacer lo dice el propio estilo (el de publicar ya va en el resumen).
  const falloDeshacer = !barra.resumen && estiloWeb.envio === 'fallo' && !publicando ? estiloWeb.mensajeFallo : null;
  if (!barra.visible && !sinGuardar && !falloDeshacer) return null;

  const [cabeza, ...cola] = (barra.texto ?? '').split(': ');
  const conCambios = !!barra.texto;
  const extra = pendientes.piezas.length > 0
    ? `Y a la vez, lo que enseña${pendientes.piezas.length > 1 ? 'n' : ''} ${unirGrupos(pendientes.piezas.map(p => `«${p.nombre}»`))}: ${unirGrupos(pendientes.piezas.map(p => unirGrupos(p.grupos)))}.`
    : undefined;

  return (
    <>
      <div
        role="region"
        aria-label="Publicar en tu web"
        className={cn(
          'sticky bottom-3 z-30 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-t-card border bg-card px-4 py-3 shadow-t-card sm:px-5',
          conCambios || publicando ? 'border-warning/40 shadow-lg' : 'border-border',
        )}
      >
        <div className="min-w-0 flex-[1_1_18rem] space-y-1.5">
          <p role="status" aria-live="polite" className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
            {publicando ? (
              <><Loader2 size={14} className="mt-[3px] shrink-0 animate-spin" aria-hidden />Publicando en tu web…</>
            ) : conCambios ? (
              <>
                <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-warning" />
                {/* Un nombre largo de widget o de grupo no cabe en 375 px sin partirse. */}
                <span className="min-w-0 [overflow-wrap:anywhere]"><strong className="font-semibold">{cabeza}</strong>{cola.length ? `: ${cola.join(': ')}` : ''}. Solo lo ves tú, aquí.</span>
              </>
            ) : barra.resumen?.tono === 'ok' ? (
              <><Check size={14} className="mt-[3px] shrink-0 text-success" aria-hidden /><span className="min-w-0">{barra.resumen.texto}</span></>
            ) : null}
          </p>
          {barra.resumen && barra.resumen.tono !== 'ok' && !publicando && (
            // A medias o todo mal: lo que el servidor dijo, en rojo. Lo pendiente sigue ahí.
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
              <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-destructive" /><span className="min-w-0 [overflow-wrap:anywhere]">{barra.resumen.texto}</span>
            </p>
          )}
          {falloDeshacer && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] leading-relaxed text-foreground">
              <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-destructive" /><span className="min-w-0">{falloDeshacer}</span>
            </p>
          )}
          {pendientes.bloqueo && !publicando && (
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-foreground">
              <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              <span className="min-w-0">{pendientes.bloqueo}{pendientes.estilo && estiloWeb.errores.length > 0 && ' Cámbialo en «Cómo se ve», o descarta el estilo.'}</span>
            </p>
          )}
          {sinGuardar && (
            <p className="text-[12px] text-destructive">No se han guardado tus ajustes. El código que copies sigue valiendo.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {!propietaria ? (
            conCambios && <p className="text-[12.5px] text-muted-foreground">Solo la propietaria publica en tu web.</p>
          ) : (
            <>
              {estiloWeb.relectura === 'fallo' && (
                <button type="button" onClick={estiloWeb.releer} className={cn(TACTIL, 'text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
                  Volver a leer
                </button>
              )}
              {conCambios && !publicando && (
                <button type="button" onClick={barra.descartar} className={cn(TACTIL, 'text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
                  Descartar
                </button>
              )}
              {barra.puedeDeshacer && !conCambios && !publicando && (
                <button type="button" onClick={() => void barra.deshacer()} className={cn(TACTIL, 'text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
                  Deshacer
                </button>
              )}
              {(conCambios || publicando) && (
                <BotonVivo
                  destacado
                  onClick={barra.pedir}
                  disabled={publicando || !!pendientes.bloqueo}
                  label={<>{publicando && <Loader2 size={14} className="animate-spin" aria-hidden />}Publicar en mi web</>}
                />
              )}
            </>
          )}
        </div>
      </div>

      {propietaria && estiloWeb.base && (
        <ConfirmarEstiloEnTuWeb
          abierto={barra.confirmando}
          onAbierto={barra.setConfirmando}
          piezas={s.piezas}
          borrador={estiloWeb.borrador}
          titulo="¿Publicar este estilo en tu web?"
          verbo="Publicar en mi web"
          extra={extra}
          onConfirmar={() => void barra.publicar()}
        />
      )}
    </>
  );
}
