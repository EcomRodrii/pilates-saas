'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MapPin, Check, X } from 'lucide-react';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
} from '@/lib/network/catalogo';
import { NW_TINTA, NW_GRIS_VERDOSO, NW_BORDE, NW_PRODUCTO, NW_SAGE, NW_FONDO } from './tokens';

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

const VALORACION_OPCIONES = [
  { valor: '', etiqueta: 'Cualquiera' },
  { valor: '4', etiqueta: '4+ ★' },
  { valor: '4.5', etiqueta: '4,5+ ★' },
] as const;

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="py-5" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: NW_GRIS_VERDOSO }}>{titulo}</p>
      {children}
    </div>
  );
}

// Antes "Especialidad"/"Experiencia"/"Valoración"/"Verificación" eran
// checkbox/radio de formulario mientras "Disponibilidad"/"Precio" ya eran
// pills — la misma sidebar mezclaba dos lenguajes visuales, y el de
// checkbox es el que usa cualquier filtro de `/dashboard`: es justo lo que
// hacía sentir el marketplace como panel de admin en vez de Bsport/Momence
// (auditoría UX 2026-08-20). Un único control (pill) para toda la sidebar,
// semántica intacta (`<input type="checkbox"|"radio">` real y oculto,
// sr-only, mismo criterio de accesibilidad que ya tenían CheckboxFiltro/
// RadioFiltro) — solo cambia el visual.
function PillFiltro({
  tipo, nombre, activo, onChange, children,
}: {
  tipo: 'checkbox' | 'radio'; nombre?: string; activo: boolean; onChange: () => void; children: React.ReactNode;
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 text-[12.5px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-1"
      style={{ borderRadius: 999, border: `1px solid ${activo ? NW_PRODUCTO : NW_BORDE}`, background: activo ? NW_SAGE : '#fff', color: NW_TINTA }}
    >
      <input type={tipo} name={nombre} checked={activo} onChange={onChange} className="sr-only" />
      {activo && <Check size={12} strokeWidth={3} style={{ color: NW_PRODUCTO }} />}
      {children}
    </label>
  );
}

export function FiltrosSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [ciudad, setCiudad] = useState(searchParams.get('ciudad') ?? '');
  const [idioma, setIdioma] = useState(searchParams.get('idioma') ?? '');

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
        <div className="flex flex-wrap gap-1.5">
          {ESPECIALIDADES_NETWORK.map(v => (
            <PillFiltro key={v} tipo="checkbox" activo={especialidadesActivas.includes(v)} onChange={() => toggleEnLista('especialidades', v)}>
              {ESPECIALIDAD_LABEL[v]}
            </PillFiltro>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Experiencia">
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCIA_OPCIONES.map(o => (
            <PillFiltro
              key={o.valor} tipo="radio" nombre="experienciaMinima"
              activo={(searchParams.get('experienciaMinima') ?? '') === o.valor}
              onChange={() => actualizar('experienciaMinima', o.valor || null)}
            >
              {o.etiqueta} años
            </PillFiltro>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Disponibilidad">
        <div className="flex flex-wrap gap-1.5">
          {DISPONIBILIDAD_ESTADOS_NETWORK.filter(v => v !== 'no_disponible').map(v => (
            <PillFiltro key={v} tipo="checkbox" activo={disponibilidadActiva.includes(v)} onChange={() => toggleEnLista('disponibilidad', v)}>
              {DISPONIBILIDAD_ESTADO_LABEL[v]}
            </PillFiltro>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Precio máximo">
        <div className="flex flex-wrap gap-1.5">
          {TARIFAS_RANGO_NETWORK.map(v => (
            <PillFiltro key={v} tipo="checkbox" activo={tarifaActiva.includes(v)} onChange={() => toggleEnLista('tarifaRango', v)}>
              {TARIFA_RANGO_LABEL[v]}
            </PillFiltro>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Valoración mínima">
        <div className="flex flex-wrap gap-1.5">
          {VALORACION_OPCIONES.map(o => (
            <PillFiltro
              key={o.valor} tipo="radio" nombre="valoracionMinima"
              activo={(searchParams.get('valoracionMinima') ?? '') === o.valor}
              onChange={() => actualizar('valoracionMinima', o.valor || null)}
            >
              {o.etiqueta}
            </PillFiltro>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Verificación">
        <div className="flex flex-wrap gap-1.5">
          <PillFiltro
            tipo="checkbox"
            activo={searchParams.get('identidadVerificada') === '1'}
            onChange={() => actualizar('identidadVerificada', searchParams.get('identidadVerificada') === '1' ? null : '1')}
          >
            Identidad verificada
          </PillFiltro>
          <PillFiltro
            tipo="checkbox"
            activo={searchParams.get('experienciaVerificada') === '1'}
            onChange={() => actualizar('experienciaVerificada', searchParams.get('experienciaVerificada') === '1' ? null : '1')}
          >
            Experiencia verificada
          </PillFiltro>
          <PillFiltro
            tipo="checkbox"
            activo={searchParams.get('certificacionVerificada') === '1'}
            onChange={() => actualizar('certificacionVerificada', searchParams.get('certificacionVerificada') === '1' ? null : '1')}
          >
            Formación verificada
          </PillFiltro>
        </div>
      </Grupo>

      <Grupo titulo="Idioma">
        <input
          value={idioma}
          onChange={e => setIdioma(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && actualizar('idioma', idioma || null)}
          onBlur={() => actualizar('idioma', idioma || null)}
          placeholder="Inglés, francés..."
          className="w-full px-3 py-2.5 text-[13.5px] outline-none"
          style={{ border: `1px solid ${NW_BORDE}`, borderRadius: 13, color: NW_TINTA }}
        />
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
  if (searchParams.get('valoracionMinima')) {
    chips.push({ clave: 'valoracionMinima', valor: searchParams.get('valoracionMinima')!, etiqueta: `${searchParams.get('valoracionMinima')}+ ★` });
  }
  if (searchParams.get('identidadVerificada') === '1') {
    chips.push({ clave: 'identidadVerificada', valor: '1', etiqueta: 'Identidad verificada' });
  }
  if (searchParams.get('experienciaVerificada') === '1') {
    chips.push({ clave: 'experienciaVerificada', valor: '1', etiqueta: 'Experiencia verificada' });
  }
  if (searchParams.get('idioma')) {
    chips.push({ clave: 'idioma', valor: searchParams.get('idioma')!, etiqueta: searchParams.get('idioma')! });
  }
  if (searchParams.get('certificacionVerificada') === '1') {
    chips.push({ clave: 'certificacionVerificada', valor: '1', etiqueta: 'Formación verificada' });
  }

  if (chips.length === 0) return null;

  const CLAVES_VALOR_UNICO = new Set(['ciudad', 'valoracionMinima', 'identidadVerificada', 'experienciaVerificada', 'certificacionVerificada', 'idioma']);

  function quitar(clave: string, valor: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (CLAVES_VALOR_UNICO.has(clave)) { sp.delete(clave); }
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
          style={{ background: NW_TINTA, color: NW_FONDO }}
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
