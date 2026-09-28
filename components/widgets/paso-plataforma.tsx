'use client';

import { useId, useState } from 'react';
import { ArrowRight, Code2, Globe, Smartphone, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { PLATAFORMAS_WEB, direccionLegible, type EstadoWeb, type PlataformaWeb } from '@/lib/widgets/recetas';
import { GrupoOpciones, Tarjeta } from './piezas';

// La pregunta única: «¿Con qué está hecha tu web?». Se contesta una vez y
// ordena todo lo demás —qué forma se recomienda, qué no funcionaría y qué
// pasos se le dan—, así que va ANTES de ajustar nada.

// Iconos genéricos a propósito: ni logos ni colores de marca de nadie.
const ICONO: Record<PlataformaWeb, typeof Globe> = {
  wordpress: Globe, wix: Globe, squarespace: Globe, webflow: Globe,
  otra: Code2, agencia: UsersRound, sinweb: Smartphone,
};

export function PasoPlataforma({ web, sitioWeb, onContestar, onCancelar }: {
  web: EstadoWeb;
  /** La web de la ficha del estudio, para no preguntarla si ya se sabe. */
  sitioWeb: string | null;
  onContestar: (web: EstadoWeb) => void;
  /** Si ya había contestado y solo venía a cambiarla. */
  onCancelar?: () => void;
}) {
  const [plataforma, setPlataforma] = useState<PlataformaWeb | null>(web.plataforma);
  const [direccion, setDireccion] = useState(web.direccion ?? direccionLegible(sitioWeb) ?? '');
  const idDireccion = useId();
  const idAyuda = useId();

  return (
    <div className="space-y-4">
      <Tarjeta
        titulo="¿Con qué está hecha tu web?"
        subtitulo="Solo te lo preguntamos una vez. Con eso te decimos cómo ponerlo en tu web y te damos sus pasos. Si te la lleva otra persona, se lo mandas desde aquí."
      >
        <GrupoOpciones
          etiqueta="Con qué está hecha tu web"
          valor={plataforma}
          onChange={setPlataforma}
          className="@md/config:grid-cols-2 @3xl/config:grid-cols-3"
          opciones={PLATAFORMAS_WEB.map(p => {
            const Icono = ICONO[p.id];
            return { valor: p.id, titulo: p.nombre, detalle: p.detalle, icono: <Icono size={16} strokeWidth={1.8} /> };
          })}
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
      </Tarjeta>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className={btnSecondary}>Cancelar</button>
        )}
        <button
          type="button"
          disabled={!plataforma}
          onClick={() => plataforma && onContestar({ plataforma, direccion: plataforma === 'sinweb' ? null : direccionLegible(direccion) })}
          className={btnPrimary}
        >
          Siguiente<ArrowRight size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
