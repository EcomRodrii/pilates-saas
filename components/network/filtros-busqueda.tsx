'use client';

import { SelectorChips } from '@/components/network/selector-chips';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  HORARIOS_NETWORK, HORARIO_LABEL,
  TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
} from '@/lib/network/catalogo';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';
import { inputCls, labelCls } from '@/app/(dashboard)/configuracion/page';

const EXPERIENCIA_OPCIONES = [
  { valor: null, etiqueta: 'Cualquiera' },
  { valor: 1, etiqueta: '1+ años' },
  { valor: 3, etiqueta: '3+ años' },
  { valor: 5, etiqueta: '5+ años' },
] as const;

const VALORACION_OPCIONES = [
  { valor: null, etiqueta: 'Cualquiera' },
  { valor: 4, etiqueta: '4+ ★' },
  { valor: 4.5, etiqueta: '4,5+ ★' },
] as const;

export function FiltrosBusquedaNetwork({
  filtro, onChange,
}: {
  filtro: FiltroBusquedaNetwork;
  onChange: (siguiente: FiltroBusquedaNetwork) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className={labelCls}>Ciudad</p>
        <input
          className={inputCls}
          value={filtro.ciudad ?? ''}
          onChange={e => onChange({ ...filtro, ciudad: e.target.value || null })}
          placeholder="Barcelona"
        />
      </div>

      <div>
        <p className={labelCls}>Especialidad</p>
        <SelectorChips
          opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
          seleccion={filtro.especialidades}
          onChange={especialidades => onChange({ ...filtro, especialidades })}
        />
      </div>

      <div>
        <p className={labelCls}>Disponibilidad</p>
        <SelectorChips
          opciones={DISPONIBILIDAD_ESTADOS_NETWORK
            .filter(v => v !== 'no_disponible')
            .map(v => ({ valor: v, etiqueta: DISPONIBILIDAD_ESTADO_LABEL[v] }))}
          seleccion={filtro.disponibilidad}
          onChange={disponibilidad => onChange({ ...filtro, disponibilidad })}
        />
      </div>

      <div>
        <p className={labelCls}>Horario</p>
        <SelectorChips
          opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
          seleccion={filtro.horarios}
          onChange={horarios => onChange({ ...filtro, horarios })}
        />
      </div>

      <div>
        <p className={labelCls}>Tipo de trabajo</p>
        <SelectorChips
          opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
          seleccion={filtro.tipoTrabajo}
          onChange={tipoTrabajo => onChange({ ...filtro, tipoTrabajo })}
        />
      </div>

      <div>
        <p className={labelCls}>Experiencia mínima</p>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCIA_OPCIONES.map(({ valor, etiqueta }) => (
            <button
              key={etiqueta}
              type="button"
              onClick={() => onChange({ ...filtro, experienciaMinima: valor })}
              aria-pressed={filtro.experienciaMinima === valor}
              className={
                filtro.experienciaMinima === valor
                  ? 'px-3 py-1.5 rounded-full text-[12px] font-medium border bg-brand text-brand-foreground border-brand'
                  : 'px-3 py-1.5 rounded-full text-[12px] font-medium border bg-card text-foreground border-border hover:bg-muted'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={labelCls}>Tarifa</p>
        <SelectorChips
          opciones={TARIFAS_RANGO_NETWORK.map(v => ({ valor: v, etiqueta: TARIFA_RANGO_LABEL[v] }))}
          seleccion={filtro.tarifaRango}
          onChange={tarifaRango => onChange({ ...filtro, tarifaRango })}
        />
      </div>

      <div>
        <p className={labelCls}>Valoración mínima</p>
        <div className="flex flex-wrap gap-2">
          {VALORACION_OPCIONES.map(({ valor, etiqueta }) => (
            <button
              key={etiqueta}
              type="button"
              onClick={() => onChange({ ...filtro, valoracionMinima: valor })}
              aria-pressed={filtro.valoracionMinima === valor}
              className={
                filtro.valoracionMinima === valor
                  ? 'px-3 py-1.5 rounded-full text-[12px] font-medium border bg-brand text-brand-foreground border-brand'
                  : 'px-3 py-1.5 rounded-full text-[12px] font-medium border bg-card text-foreground border-border hover:bg-muted'
              }
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={labelCls}>Verificación</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <input
              type="checkbox"
              checked={filtro.soloIdentidadVerificada}
              onChange={e => onChange({ ...filtro, soloIdentidadVerificada: e.target.checked })}
            />
            Identidad verificada
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <input
              type="checkbox"
              checked={filtro.soloExperienciaVerificada}
              onChange={e => onChange({ ...filtro, soloExperienciaVerificada: e.target.checked })}
            />
            Experiencia verificada
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <input
              type="checkbox"
              checked={filtro.soloCertificacionVerificada}
              onChange={e => onChange({ ...filtro, soloCertificacionVerificada: e.target.checked })}
            />
            Formación verificada
          </label>
        </div>
      </div>
    </div>
  );
}
