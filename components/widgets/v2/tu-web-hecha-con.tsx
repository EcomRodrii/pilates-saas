'use client';

import { useId, useState } from 'react';
import { Code2, Globe, Smartphone, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BotonVivo } from '@/components/dashboard/vivo';
import { btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { MONOGRAMA, PLATAFORMAS_WEB, direccionLegible, nombrePlataforma, type EstadoWeb, type PlataformaWeb } from '@/lib/widgets/recetas';
import { FOCO, GrupoOpciones, Tarjeta } from '../piezas';

// «¿Con qué está hecha tu web?» en «Tu web» v2 (decisión 3): ya no es lo primero
// que se ve al entrar, sino un bloque del paso 2, «Dónde va», que es donde se
// usa (ordena la recomendación). Se contesta una vez; contestada, se queda
// plegada en una línea con «Cambiar». La tarjeta «Tu web» de la portada abre la
// misma pregunta en un diálogo.
//
// Contestar GUARDA (en `_web`, fusionando sobre lo demás) y no navega: el paso
// sigue a la vista y «Siguiente» se enciende.
//
// Cada plataforma con su monograma (decisión 7: W, Wix, S, Wf en lugar del mismo
// globo para las cuatro), en neutro: ni logos ni colores de marca de nadie. Lo
// que no es una plataforma con nombre lleva el icono de lo que es.

const ICONO: Record<'otra' | 'agencia' | 'sinweb', typeof Code2> = {
  otra: Code2, agencia: UsersRound, sinweb: Smartphone,
};

/** El monograma o el icono de una plataforma, sin su caja (la pone quien lo usa). */
export function MonogramaPlataforma({ plataforma, size = 16 }: { plataforma: PlataformaWeb; size?: number }) {
  const letras = MONOGRAMA[plataforma];
  if (letras) {
    return (
      <span aria-hidden data-monograma={plataforma} className={cn('font-bold leading-none tracking-tight', letras.length > 2 ? 'text-[10.5px]' : 'text-[13px]')}>
        {letras}
      </span>
    );
  }
  const Icono = ICONO[plataforma as keyof typeof ICONO] ?? Globe;
  return <Icono size={size} strokeWidth={1.8} aria-hidden />;
}

/** La pregunta, abierta. */
export function PreguntaTuWeb({ web, sitioWeb, onContestar, onCancelar }: {
  web: EstadoWeb;
  /** La web de la ficha del estudio, para no preguntarla si ya se sabe. */
  sitioWeb: string | null;
  onContestar: (web: EstadoWeb) => void;
  /** Si ya la había contestado y solo venía a cambiarla. */
  onCancelar?: () => void;
}) {
  const [plataforma, setPlataforma] = useState<PlataformaWeb | null>(web.plataforma);
  const [direccion, setDireccion] = useState(web.direccion ?? direccionLegible(sitioWeb) ?? '');
  const idDireccion = useId();
  const idAyuda = useId();
  return (
    <Tarjeta
      titulo="¿Con qué está hecha tu web?"
      subtitulo="Solo te lo preguntamos una vez. Con eso te decimos cómo ponerlo en tu web y te damos sus pasos. Si te la lleva otra persona, se lo mandas desde aquí."
    >
      <GrupoOpciones
        etiqueta="Con qué está hecha tu web"
        valor={plataforma}
        onChange={setPlataforma}
        className="@md/config:grid-cols-2"
        opciones={PLATAFORMAS_WEB.map(p => ({ valor: p.id, titulo: p.nombre, detalle: p.detalle, icono: <MonogramaPlataforma plataforma={p.id} /> }))}
      />
      {plataforma !== 'sinweb' && (
        <div>
          <label htmlFor={idDireccion} className="text-[13px] font-medium text-foreground">
            ¿Cuál es su dirección? <span className="font-normal text-muted-foreground">(si quieres)</span>
          </label>
          <input
            id={idDireccion}
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="tuestudio.com"
            inputMode="url"
            autoComplete="url"
            aria-describedby={idAyuda}
            className={cn(inputCls, 'mt-1.5 max-w-sm')}
          />
          <p id={idAyuda} className="mt-1 text-[12px] text-muted-foreground">Solo para dibujar tu web en la vista previa y que veas cómo encaja.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancelar && <button type="button" onClick={onCancelar} className={btnSecondary}>Cancelar</button>}
        <BotonVivo
          disabled={!plataforma}
          onClick={() => plataforma && onContestar({ plataforma, direccion: plataforma === 'sinweb' ? null : direccionLegible(direccion) })}
          label="Guardar mi web"
        />
      </div>
    </Tarjeta>
  );
}

/** El bloque del paso 2: la pregunta si falta, y si no, su respuesta en una línea con «Cambiar». */
export function TuWebHechaCon({ web, sitioWeb, direccion, onContestar }: {
  web: EstadoWeb;
  sitioWeb: string | null;
  /** La dirección que se enseña (la suya o la de la ficha). Se nombra como texto, nunca como enlace. */
  direccion: string | null;
  onContestar: (web: EstadoWeb) => void;
}) {
  const [cambiando, setCambiando] = useState(false);
  if (!web.plataforma || cambiando) {
    return (
      <PreguntaTuWeb
        web={web}
        sitioWeb={sitioWeb}
        onContestar={w => { onContestar(w); setCambiando(false); }}
        onCancelar={web.plataforma ? () => setCambiando(false) : undefined}
      />
    );
  }
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">Tu web está hecha con</p>
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><MonogramaPlataforma plataforma={web.plataforma} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">{nombrePlataforma(web.plataforma)}</span>
          {direccion && web.plataforma !== 'sinweb' && <span className="block text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{direccion}</span>}
        </span>
        <button
          type="button"
          onClick={() => setCambiando(true)}
          aria-label="Cambiar con qué está hecha tu web"
          className={cn('min-h-11 shrink-0 px-1 text-[13px] font-semibold text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}
