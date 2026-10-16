'use client';

import { useState } from 'react';
import { ArrowRight, Globe, Palette, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonVivo, CabeceraTarjeta, fondoTenido } from '@/components/dashboard/vivo';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { estiloPorId } from '@/lib/student/apariencia';
import { filaDePortada, type AccionAviso } from '@/lib/widgets/fila-portada';
import { unirGrupos } from '@/lib/widgets/en-tu-web';
import { nombrePlataforma, type EstadoWeb } from '@/lib/widgets/recetas';
import { FOCO, TACTIL } from '../piezas';
import type { ConstructorWidgets } from '../usar-constructor';
import { FilaWidget } from './fila-widget';
import { VacioQueEnsena } from './vacio-que-ensena';
import { MonogramaPlataforma, PreguntaTuWeb } from './tu-web-hecha-con';

// La portada «Tus widgets» de «Tu web» v2 (decisión 5: siempre la entrada). Sin
// nada copiado, el vacío que enseña; con algo, una fila por pieza (la más
// reciente arriba), «Tu estilo» y «Tu web». Las filas salen de lo que ya calcula
// el constructor (`filasTienes`), con su estado y su único aviso de
// `filaDePortada`.
//
// Solo lo copiado desde aquí: si lo pegó por otro camino, no sale, y se dice.

export function PortadaTusWidgets({ s, onEmpezar, onCambiar, onCopiar, onAccion, onOtraCosa, onCambiarEstilo, onVerResultados }: {
  s: ConstructorWidgets;
  onEmpezar: (id: string) => void;
  onCambiar: (id: string) => void;
  onCopiar: (id: string) => void;
  onAccion: (id: string, hace: AccionAviso) => void;
  onOtraCosa: () => void;
  onCambiarEstilo: () => void;
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  if (!s.conCopias) {
    return <VacioQueEnsena slug={s.slug} origen={s.origen} colorEstudio={s.colorEstudio} onEmpezar={onEmpezar} />;
  }
  const ordenadas = [...s.filasTienes].sort((a, b) => Date.parse(b.en) - Date.parse(a.en));
  return (
    <div className="space-y-5">
      <section aria-labelledby="portada-tienes" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h3 id="portada-tienes" className="text-[22px] font-bold leading-tight text-foreground">Lo que tienes en tu web</h3>
            <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground text-pretty">
              Lo que has copiado desde aquí y si ya lo vemos en tu web. Si pegaste algo por otro camino, no sale en esta lista.
            </p>
          </div>
          <BotonVivo onClick={onOtraCosa} Icono={Plus} label="Poner otra cosa en tu web" />
        </div>
        <ul aria-label="Tus widgets" className="space-y-3">
          {ordenadas.map(f => (
            <FilaWidget
              key={f.id}
              f={f}
              fila={filaDePortada(f, s.ahora)}
              onCambiar={() => onCambiar(f.id)}
              onCopiar={() => onCopiar(f.id)}
              onAccion={hace => onAccion(f.id, hace)}
              onVerResultados={onVerResultados}
            />
          ))}
        </ul>
      </section>

      <div className="grid gap-4 @3xl/config:grid-cols-2">
        <TarjetaTuEstilo s={s} onCambiarEstilo={onCambiarEstilo} />
        <TarjetaTuWeb s={s} />
      </div>
    </div>
  );
}

function TarjetaTuEstilo({ s, onCambiarEstilo }: { s: ConstructorWidgets; onCambiarEstilo: () => void }) {
  const { estiloWeb } = s;
  // Lo que hay en su web (lo publicado), no el borrador: mientras carga, o si no
  // se ha podido leer, no se dice ninguno (sería inventarlo).
  const listo = estiloWeb.fase === 'listo' && estiloWeb.base;
  const estilo = listo ? estiloPorId(estiloWeb.publicado?.estilo ?? estiloWeb.base!.app.estilo) : null;
  const nombre = listo
    ? (estiloWeb.publicado?.estilo ? estilo!.nombre : `Igual que tu app · ${estilo!.nombre}`)
    : null;
  const conDisenoPropio = s.filasTienes.filter(f => f.pieza.disenoPropio).map(f => f.nombre);
  const muestras = estilo ? [estilo.background, estilo.card, estilo.foreground, estiloWeb.base?.colorPrimario ?? s.colorEstudio].filter((c): c is string => !!c) : [];
  return (
    <section aria-labelledby="portada-estilo" className="rounded-t-card border border-border bg-card p-4 shadow-t-card @md/config:p-5" style={fondoTenido('magenta', 9)}>
      <CabeceraTarjeta tono="magenta" Icono={Palette} titulo="Tu estilo" id="portada-estilo" sub={nombre ?? undefined} />
      <p className="mt-3 text-[12.5px] leading-relaxed text-foreground">
        Llega a lo que tienes dentro de una página, sin marco o en una ventana encima, sin volver a pegar nada.
        {conDisenoPropio.length > 0 && <> A <strong className="font-semibold">{unirGrupos(conDisenoPropio)}</strong> no, porque {conDisenoPropio.length === 1 ? 'tiene' : 'tienen'} su propio diseño.</>}
      </p>
      {muestras.length > 0 && (
        <div aria-hidden className="mt-3 flex gap-1.5">
          {muestras.map((c, i) => <span key={`${c}-${i}`} className="size-6 rounded-md border border-black/10" style={{ background: c }} />)}
        </div>
      )}
      <button type="button" onClick={onCambiarEstilo} className={cn(TACTIL, 'mt-2 gap-0.5 text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}>
        Cambiar el estilo<ArrowRight size={13} aria-hidden />
      </button>
    </section>
  );
}

function TarjetaTuWeb({ s }: { s: ConstructorWidgets }) {
  const [abierta, setAbierta] = useState(false);
  const { web } = s;
  return (
    <section aria-labelledby="portada-web" className="rounded-t-card border border-border bg-card p-4 shadow-t-card @md/config:p-5" style={fondoTenido('azul', 9)}>
      <CabeceraTarjeta tono="azul" Icono={Globe} titulo="Tu web" id="portada-web" />
      <div className="mt-3 flex items-start gap-2.5">
        {/* Su monograma (decisión 7), el mismo que en «Dónde va». */}
        {web.plataforma && (
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <MonogramaPlataforma plataforma={web.plataforma} size={15} />
          </span>
        )}
        <p className="min-w-0 text-[12.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
          {web.plataforma
            ? <>{nombrePlataforma(web.plataforma)}{s.direccionWeb && web.plataforma !== 'sinweb' ? ` · ${s.direccionWeb}` : ''}. Con eso te damos sus pasos.</>
            : 'Aún no nos has dicho con qué está hecha tu web. Con eso te decimos cómo ponerlo y te damos sus pasos.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={web.plataforma ? 'Cambiar con qué está hecha tu web' : 'Decir con qué está hecha tu web'}
        className={cn(TACTIL, 'mt-2 gap-0.5 text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
      >
        {web.plataforma ? 'Cambiar' : 'Decírnoslo'}<ArrowRight size={13} aria-hidden />
      </button>
      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-0">
          <DialogTitle className="sr-only">Con qué está hecha tu web</DialogTitle>
          {/* El diálogo va en un portal, fuera del contenedor de Configuración: se le da el suyo. */}
          {abierta && (
            <div className="@container/config">
              <PreguntaTuWeb
                web={web}
                sitioWeb={s.studio?.sitioWeb ?? null}
                onContestar={(nueva: EstadoWeb) => { s.guardarWeb(nueva); setAbierta(false); }}
                onCancelar={() => setAbierta(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
