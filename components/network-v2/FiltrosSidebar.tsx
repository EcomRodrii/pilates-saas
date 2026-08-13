'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MapPin, Check, X } from 'lucide-react';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
} from '@/lib/network/catalogo';
import { NW_TINTA, NW_GRIS_VERDOSO, NW_BORDE, NW_PRODUCTO, NW_SAGE } from './tokens';

// Sidebar de filtros del marketplace (1b del rediseño) — mismo mecanismo que
// components/network-publico/filtros-marketplace.tsx (URL-driven,
// router.push, SSR sigue funcionando), reorganizado en grupos con label
// uppercase + controles del tamaño/forma del README (checkbox 19px,
// pills, radios). NO incluye "Modalidad" (Presencial/Online) ni el radio en
// km del mock: ninguno de los dos existe en el modelo de datos real
// (red_perfiles no tiene columna de modalidad ni lat/lng) — se listan
// solo los filtros que el backend puede responder de verdad
// (lib/network/publico.ts), en vez de fabricar controles decorativos.
const EXPERIENCIA_OPCIONES = [
  { valor: '', etiqueta: 'Cualquiera' },
  { valor: '1', etiqueta: '1+' },
  { valor: '3', etiqueta: '3+' },
  { valor: '5', etiqueta: '5+' },
  { valor: '10', etiqueta: '10+' },
] as const;

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="py-5" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: NW_GRIS_VERDOSO }}>{titulo}</p>
      {children}
    </div>
  );
}

export function FiltrosSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [ciudad, setCiudad] = useState(searchParams.get('ciudad') ?? '');

  function actualizar(clave: string, valor: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (valor) sp.set(clave, valor); else sp.delete(clave);
    startTransition(() => router.push(`${pathname}?${sp}`));
  }

  function toggleEnLista(clave: string, valor: string) {
    const actuales = (searchParams.get(clave) ?? '').split(',').filter(Boolean);
    const siguiente = actuales.includes(valor) ? actuales.filter(v => v !== valor) : [...actuales, valor];
    actualizar(clave, siguiente.length ? siguiente.join(',') : null);
  }

  const especialidadesActivas = (searchParams.get('especialidades') ?? '').split(',').filter(Boolean);
  const disponibilidadActiva = (searchParams.get('disponibilidad') ?? '').split(',').filter(Boolean);
  const tarifaActiva = (searchParams.get('tarifaRango') ?? '').split(',').filter(Boolean);
  const hayFiltros = Boolean(searchParams.toString());

  return (
    <div className="bg-white p-5" style={{ border: `1px solid ${NW_BORDE}`, borderRadius: 20 }}>
      <div className="flex items-center justify-between pb-4">
        <p className="text-[14px] font-extrabold" style={{ color: NW_TINTA }}>Filtros</p>
        {hayFiltros && (
          <button type="button" onClick={() => router.push(pathname)} className="text-[12.5px] font-semibold" style={{ color: NW_PRODUCTO }}>
            Limpiar
          </button>
        )}
      </div>

      <Grupo titulo="Ubicación">
        <div className="relative">
          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: NW_PRODUCTO }} />
          <input
            value={ciudad}
            onChange={e => setCiudad(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && actualizar('ciudad', ciudad || null)}
            onBlur={() => actualizar('ciudad', ciudad || null)}
            placeholder="Ciudad"
            className="w-full pl-9 pr-3 py-2.5 text-[13.5px] outline-none"
            style={{ border: `1px solid ${NW_BORDE}`, borderRadius: 13, color: NW_TINTA }}
          />
        </div>
      </Grupo>

      <Grupo titulo="Especialidad">
        <div className="space-y-2">
          {ESPECIALIDADES_NETWORK.map(v => {
            const activo = especialidadesActivas.includes(v);
            return (
              <label key={v} className="flex items-center gap-2.5 cursor-pointer text-[13.5px]" style={{ color: NW_TINTA }}>
                <span
                  className="shrink-0 flex items-center justify-center transition-colors"
                  style={{ width: 19, height: 19, borderRadius: 6, background: activo ? NW_PRODUCTO : '#fff', border: `1.5px solid ${activo ? NW_PRODUCTO : NW_BORDE}` }}
                  onClick={() => toggleEnLista('especialidades', v)}
                >
                  {activo && <Check size={13} color="#fff" strokeWidth={3} />}
                </span>
                <span onClick={() => toggleEnLista('especialidades', v)}>{ESPECIALIDAD_LABEL[v]}</span>
              </label>
            );
          })}
        </div>
      </Grupo>

      <Grupo titulo="Experiencia">
        <div className="space-y-2">
          {EXPERIENCIA_OPCIONES.map(o => {
            const activo = (searchParams.get('experienciaMinima') ?? '') === o.valor;
            return (
              <label key={o.valor} className="flex items-center gap-2.5 cursor-pointer text-[13.5px]" style={{ color: NW_TINTA }} onClick={() => actualizar('experienciaMinima', o.valor || null)}>
                <span className="shrink-0 rounded-full" style={{ width: 16, height: 16, border: `1.5px solid ${activo ? NW_PRODUCTO : NW_BORDE}`, boxShadow: activo ? `inset 0 0 0 3px #fff, inset 0 0 0 999px ${NW_PRODUCTO}` : undefined }} />
                {o.etiqueta} años
              </label>
            );
          })}
        </div>
      </Grupo>

      <Grupo titulo="Disponibilidad">
        <div className="flex flex-wrap gap-1.5">
          {DISPONIBILIDAD_ESTADOS_NETWORK.filter(v => v !== 'no_disponible').map(v => {
            const activo = disponibilidadActiva.includes(v);
            return (
              <button
                key={v} type="button" onClick={() => toggleEnLista('disponibilidad', v)}
                className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={{ borderRadius: 999, border: `1px solid ${activo ? NW_PRODUCTO : NW_BORDE}`, background: activo ? NW_SAGE : '#fff', color: NW_TINTA }}
              >
                {DISPONIBILIDAD_ESTADO_LABEL[v]}
              </button>
            );
          })}
        </div>
      </Grupo>

      <Grupo titulo="Precio máximo">
        <div className="flex flex-wrap gap-1.5">
          {TARIFAS_RANGO_NETWORK.map(v => {
            const activo = tarifaActiva.includes(v);
            return (
              <button
                key={v} type="button" onClick={() => toggleEnLista('tarifaRango', v)}
                className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
                style={{ borderRadius: 999, border: `1px solid ${activo ? NW_PRODUCTO : NW_BORDE}`, background: activo ? NW_SAGE : '#fff', color: NW_TINTA }}
              >
                {TARIFA_RANGO_LABEL[v]}
              </button>
            );
          })}
        </div>
      </Grupo>
    </div>
  );
}

/** Chips activos removibles, encima de los resultados. */
export function ChipsActivos() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const chips: { clave: string; valor: string; etiqueta: string }[] = [];
  if (searchParams.get('ciudad')) chips.push({ clave: 'ciudad', valor: searchParams.get('ciudad')!, etiqueta: searchParams.get('ciudad')! });
  for (const v of (searchParams.get('especialidades') ?? '').split(',').filter(Boolean)) {
    if (esEspecialidad(v)) chips.push({ clave: 'especialidades', valor: v, etiqueta: ESPECIALIDAD_LABEL[v] });
  }
  for (const v of (searchParams.get('disponibilidad') ?? '').split(',').filter(Boolean)) {
    if (esDisponibilidad(v)) chips.push({ clave: 'disponibilidad', valor: v, etiqueta: DISPONIBILIDAD_ESTADO_LABEL[v] });
  }
  for (const v of (searchParams.get('tarifaRango') ?? '').split(',').filter(Boolean)) {
    if (esTarifa(v)) chips.push({ clave: 'tarifaRango', valor: v, etiqueta: TARIFA_RANGO_LABEL[v] });
  }

  if (chips.length === 0) return null;

  function quitar(clave: string, valor: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (clave === 'ciudad') { sp.delete('ciudad'); }
    else {
      const restantes = (sp.get(clave) ?? '').split(',').filter(v => v && v !== valor);
      if (restantes.length) sp.set(clave, restantes.join(',')); else sp.delete(clave);
    }
    router.push(`${pathname}?${sp}`);
  }

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {chips.map(c => (
        <button
          key={`${c.clave}-${c.valor}`} type="button" onClick={() => quitar(c.clave, c.valor)}
          className="inline-flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 rounded-full text-[12.5px] font-semibold"
          style={{ background: NW_TINTA, color: '#FAF9F5' }}
        >
          {c.etiqueta} <X size={12} />
        </button>
      ))}
    </div>
  );
}

function esEspecialidad(v: string): v is (typeof ESPECIALIDADES_NETWORK)[number] {
  return (ESPECIALIDADES_NETWORK as readonly string[]).includes(v);
}
function esDisponibilidad(v: string): v is (typeof DISPONIBILIDAD_ESTADOS_NETWORK)[number] {
  return (DISPONIBILIDAD_ESTADOS_NETWORK as readonly string[]).includes(v);
}
function esTarifa(v: string): v is (typeof TARIFAS_RANGO_NETWORK)[number] {
  return (TARIFAS_RANGO_NETWORK as readonly string[]).includes(v);
}
