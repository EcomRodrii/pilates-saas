'use client';

import type { ReactNode } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, Info, Plus, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { estiloPorId } from '@/lib/student/apariencia';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
import { METODOS } from '@/lib/widgets/catalogo';
import { textoCambios, textosEnTuWeb, unirGrupos, type PiezaCopiada } from '@/lib/widgets/en-tu-web';
import { FOCO, TACTIL, Tarjeta, fechaCorta } from './piezas';
import { ICONOS } from './paso-que';
import type { EstiloWebPanel } from './usar-estilo-web';

// «Lo que tienes en tu web» (Fase C, 28-sep-2026): la portada del constructor
// cuando ya ha copiado algo. Una fila por pieza copiada, el estilo de sus
// widgets y el botón para poner otra cosa. Las frases salen de
// lib/widgets/en-tu-web.ts, donde está también lo que NUNCA se dice.
//
// ⚠️ Solo lo copiado desde aquí: con el botón o a mano desde «Ver el código»
// (Fase D: la copia a mano del código entero también se guarda). Si lo pegó
// por otro camino, no sale, y el subtítulo lo dice. Su web se nombra como
// TEXTO, nunca como enlace: el anfitrión llega de fuera y no se le ofrece ir a
// una dirección que podría haber puesto cualquiera.

export interface FilaTienes {
  id: string;
  nombre: string;
  /** Nombre del icono de lucide del catálogo. */
  icono: string;
  /** ISO: cuándo se copió. */
  en: string;
  pieza: PiezaCopiada;
  /** El mes de su etiqueta, ya en una línea (`textoMes`); `null` = no se enseña. */
  mes: string | null;
  /** Lo nuevo se copia como enlace (un enlace, o el botón de su propia web). */
  esEnlace: boolean;
  /** Su web, si va sin marco y no la tiene autorizada. */
  webSinAutorizar: string | null;
  /**
   * La lista de webs autorizadas se puede abrir desde aquí: solo se pinta con
   * la nativa de AHORA. Si ya no va sin marco, el aviso sigue siendo cierto
   * (lo pegado sí va sin marco), pero no hay adónde llevarla.
   */
  conListaDeWebs: boolean;
  /**
   * Lo pegado es un código de ANTES del código por id (lib/widgets/pieza.ts), y
   * ella puede pasarse al de ahora: cada cambio le pide pegarlo otra vez hasta
   * que lo cambie una sola vez.
   */
  codigoAntiguo: boolean;
}

export function LoQueTienes({
  filas, ahora, estilo, onCambiar, onCopiarNuevo, onEstiloComun, onWebsAutorizadas, onCambiarEstilo, onOtraCosa, onVerResultados,
}: {
  filas: readonly FilaTienes[];
  /** El `ahora` fijado tras montar (`null` hasta entonces): con él, «hace 2 h». */
  ahora: number | null;
  /** El estilo de sus widgets: el MISMO hook que usa «Cómo se ve» (vive en el constructor). */
  estilo: EstiloWebPanel;
  onCambiar: (id: string) => void;
  onCopiarNuevo: (id: string) => void;
  onEstiloComun: (id: string) => void;
  onWebsAutorizadas: (id: string) => void;
  onCambiarEstilo: () => void;
  onOtraCosa: () => void;
  /** Solo si puede ver los resultados: lleva a los de la etiqueta con la que se copió. */
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  // La más reciente, arriba.
  const ordenadas = [...filas].sort((a, b) => Date.parse(b.en) - Date.parse(a.en));
  // Igual que «Igual que tu app · …» en «Cómo se ve» (estilo-web.tsx). Mientras
  // carga, o si no se ha podido leer, no se dice ninguno: sería inventarlo.
  const nombreEstilo = estilo.fase === 'listo' && estilo.base
    ? (estilo.publicado?.estilo ? estiloPorId(estilo.publicado.estilo).nombre : `Igual que tu app · ${estiloPorId(estilo.base.app.estilo).nombre}`)
    : undefined;
  // Sin marco (Fase E) el estilo llega con sus datos; mientras no hay ninguno
  // aplicado que le llegue (solo quitar el pie no, porque no lo lleva), lo
  // pegado sin marco se ve como siempre. Solo con lo publicado ya leído, y
  // solo si alguna pieza va así y lo recibe (sin diseño propio).
  const sinMarcoComoSiempre = estilo.fase === 'listo' && nadaParaSinMarco(estilo.publicado)
    && filas.some(f => f.pieza.metodo === 'nativa' && !f.pieza.disenoPropio);
  // A cuáles no les llega el estilo, por su nombre: «salvo a lo que lleva su
  // propio diseño» en abstracto no le dice que son SUS precios.
  const conDisenoPropio = ordenadas.filter(f => f.pieza.disenoPropio).map(f => f.nombre);

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo="Lo que tienes en tu web"
        subtitulo="Lo que has copiado desde aquí. Si pegaste algo por otro camino, no sale en esta lista."
      >
        <ul className="divide-y divide-border">
          {ordenadas.map(f => (
            <FilaPieza
              key={f.id}
              f={f}
              ahora={ahora}
              onCambiar={() => onCambiar(f.id)}
              onCopiarNuevo={() => onCopiarNuevo(f.id)}
              onEstiloComun={() => onEstiloComun(f.id)}
              onWebsAutorizadas={() => onWebsAutorizadas(f.id)}
              onVerResultados={onVerResultados}
            />
          ))}
        </ul>
        <button type="button" onClick={onOtraCosa} className={cn(btnPrimary, 'w-full justify-center @md/config:w-auto')}>
          <Plus size={15} aria-hidden />Poner otra cosa en tu web
        </button>
      </Tarjeta>

      <Tarjeta titulo="Estilo de tus widgets" etiqueta="aplicar" subtitulo={nombreEstilo}>
        <div className="space-y-3">
          <p className="text-[12.5px] leading-relaxed text-foreground">
            Llega a lo que tienes dentro de una página, sin marco o en una ventana encima.
            {conDisenoPropio.length > 0 && <> A <strong className="font-semibold">{unirGrupos(conDisenoPropio)}</strong> no, porque {conDisenoPropio.length === 1 ? 'tiene' : 'tienen'} su propio diseño.</>}
          </p>
          {sinMarcoComoSiempre && (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Lo que va sin marco sigue con su aspecto de siempre mientras no apliques ningún cambio de estilo.
            </p>
          )}
          {estilo.pendiente && (
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-foreground">
              <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-warning" />Tienes un estilo sin aplicar.
            </p>
          )}
          <button type="button" onClick={onCambiarEstilo} className={btnSecondary}>Cambiar el estilo</button>
        </div>
      </Tarjeta>
    </div>
  );
}

function FilaPieza({ f, ahora, onCambiar, onCopiarNuevo, onEstiloComun, onWebsAutorizadas, onVerResultados }: {
  f: FilaTienes;
  ahora: number | null;
  onCambiar: () => void;
  onCopiarNuevo: () => void;
  onEstiloComun: () => void;
  onWebsAutorizadas: () => void;
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  const { pieza: p } = f;
  const Icono = ICONOS[f.icono] ?? CalendarDays;
  const textos = ahora === null ? { linea: null, version: null } : textosEnTuWeb(p.estado, ahora);
  const copiarNuevo = f.esEnlace ? 'Copiar el enlace nuevo' : 'Copiar el código nuevo';
  const visto = p.estado.tipo === 'visto';

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 py-4 first:pt-0 last:pb-0">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icono size={18} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 space-y-1.5">
        <h4 className="text-[13.5px] font-semibold leading-snug text-foreground">{f.nombre}</h4>
        <p className="text-[12px] text-muted-foreground">
          {p.metodo ? `${METODOS[p.metodo].nombre} · copiado el ${fechaCorta(f.en)}` : `Copiado el ${fechaCorta(f.en)}`}
        </p>
        {f.mes && (
          <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <TrendingUp size={13} aria-hidden className="shrink-0" />{f.mes}
          </p>
        )}
        {textos.linea && (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-foreground">
            <span aria-hidden className={cn('mt-[7px] size-2 shrink-0 rounded-full', visto ? 'bg-success' : 'bg-muted-foreground/40')} />
            {/* Un dominio largo no cabe en 390 px sin partirlo. */}
            <span className="min-w-0 [overflow-wrap:anywhere]">{textos.linea}</span>
          </p>
        )}
      </div>

      {/* En el móvil, los avisos a todo lo ancho: debajo del icono no queda sitio para leerlos. */}
      <div className="col-span-2 min-w-0 space-y-2 @md/config:col-span-1 @md/config:col-start-2">
        {textos.version && (
          <Nota tono="aviso" accion={copiarNuevo} onAccion={onCopiarNuevo}>{textos.version}</Nota>
        )}
        {p.desfasado && (
          <Nota tono="aviso" accion={copiarNuevo} onAccion={onCopiarNuevo}>{textoCambios(p.cambios)}</Nota>
        )}
        {/*
          No es un fallo (lo de antes sigue funcionando): una mejora que se hace una vez.
          Con un popup de antes, incluye su botón, que tampoco sigue el estilo.
        */}
        {f.codigoAntiguo && !p.desfasado && !textos.version && (
          <Nota tono="info" accion={f.esEnlace ? 'Copiar el enlace de ahora' : 'Copiar el código de ahora'} onAccion={onCopiarNuevo}>
            Tu web tiene {f.esEnlace ? 'un enlace' : 'un código'} de antes: si cambias qué enseña, tendrás que pegarlo otra vez. Cámbialo una sola vez por el de ahora y esos cambios llegarán con «Aplicar en mi web».
            {p.botonCongelado && ' Con el de ahora, el botón que abre la ventana también seguirá el estilo de tus widgets.'}
          </Nota>
        )}
        {p.disenoPropio && (
          <Nota tono="aviso" accion="Que siga el estilo de tus widgets" onAccion={onEstiloComun}>
            Tiene su propio diseño: el estilo, la letra y los colores que elijas para tus widgets no le llegan.
          </Nota>
        )}
        {/*
          Fase D: un popup copiado antes de que su botón siguiera el estilo. Con ámbar o con
          otra versión a la vista ya se le pide copiarlo; y sin `ahora` (antes de montar) aún
          no se sabe si habrá versión: saldría y se iría.
        */}
        {p.botonCongelado && !f.codigoAntiguo && !p.desfasado && ahora !== null && !textos.version && (
          <Nota tono="info" accion="Ir a copiarlo" onAccion={onCopiarNuevo}>
            El botón que abre la ventana es de un código anterior y se queda como está. Si quieres que también cambie solo con el estilo de tus widgets, copia el código de ahora y pégalo en lugar del de antes.
          </Nota>
        )}
        {f.webSinAutorizar && (
          <Nota tono="aviso" accion={f.conListaDeWebs ? 'Ir a las webs autorizadas' : undefined} onAccion={onWebsAutorizadas}>
            Tu web ({f.webSinAutorizar}) no está entre las webs autorizadas, y sin marco el widget solo carga en las que autorices.
          </Nota>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={onCambiar} aria-label={`Cambiar ${f.nombre}`} className={btnSecondary}>Cambiar</button>
          {onVerResultados && (
            <button
              type="button"
              onClick={() => onVerResultados(p.etiqueta)}
              aria-label={`Ver resultados de ${f.nombre}`}
              className={cn(TACTIL, 'gap-0.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
            >
              Ver resultados<ArrowRight size={12} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Lo que pide algo de ella en una fila: qué pasa y, si lo hay aquí, el botón que lo arregla. */
function Nota({ tono, accion, onAccion, children }: { tono: 'aviso' | 'info'; accion?: string; onAccion?: () => void; children: ReactNode }) {
  const Icono = tono === 'aviso' ? AlertCircle : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground',
      tono === 'aviso' ? 'border-warning/40 bg-warning/10' : 'border-border bg-muted/50',
    )}>
      <Icono size={15} aria-hidden className={cn('mt-0.5 shrink-0', tono === 'aviso' ? 'text-warning' : 'text-muted-foreground')} />
      <div className="min-w-0">
        <p className="[overflow-wrap:anywhere]">{children}</p>
        {accion && onAccion && (
          <button type="button" onClick={onAccion} className={cn(TACTIL, 'font-semibold underline underline-offset-2 hover:no-underline', FOCO)}>
            {accion}
          </button>
        )}
      </div>
    </div>
  );
}
