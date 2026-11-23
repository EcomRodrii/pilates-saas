'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { filtroDeEtiqueta, type FiltroActualizaciones } from '@/lib/actualizaciones/version';

// El changelog público con la forma del de Shopify (changelog.shopify.com, medido el 23-nov-2026): una línea de tiempo con la fecha
// a la izquierda, cada entrada con su título subrayado, sus etiquetas, y a la derecha una caja de filtros. En Shopify cada entrada es
// UN cambio con su página; aquí la entrada es una VERSIÓN (el dato es ese: `changelog_versiones` con su lista de cambios de una línea).

export interface CambioNovedad { id: string; etiqueta: string; texto: string; orden: number }
export interface VersionNovedad { id: string; version: string; titulo: string; fecha_publicacion: string; cambios: CambioNovedad[] }

const FILTROS: { id: FiltroActualizaciones; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nuevas', label: 'Nueva función' },
  { id: 'mejoras', label: 'Mejora' },
  { id: 'correcciones', label: 'Arreglo' },
];
const ETIQUETA: Record<string, string> = { NUEVA_FUNCIONALIDAD: 'Nueva función', MEJORA: 'Mejora', RENDIMIENTO: 'Rendimiento', ARREGLO: 'Arreglo' };
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
// «Sparkles» es el icono de «novedad» en todo el producto (lo fija lib/tenti/donde-vive-tenti.test.ts).
const ICONO_ETIQUETA = { NUEVA_FUNCIONALIDAD: Sparkles } as const;
const POR_VERSION = 3;

const fechaCorta = (iso: string) => { const [, m, d] = iso.split('-'); return `${MESES[Number(m) - 1]} ${Number(d)}`; };
const ancla = (v: string) => `v${v.replace('.', '-')}`;

export function ListaNovedades({ versiones }: { versiones: VersionNovedad[] }) {
  const [filtro, setFiltro] = useState<FiltroActualizaciones>('todas');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const visibles = useMemo(() => versiones
    .map((v) => ({ ...v, cambios: filtro === 'todas' ? v.cambios : v.cambios.filter((c) => filtroDeEtiqueta(c.etiqueta as never) === filtro) }))
    .filter((v) => v.cambios.length > 0), [versiones, filtro]);

  return (
    <div className="nv-grid">
      <ol className="nv-linea">
        {visibles.map((v) => {
          const todas = abiertas.has(v.id);
          const lista = todas ? v.cambios : v.cambios.slice(0, POR_VERSION);
          const tipos = [...new Set(v.cambios.map((c) => c.etiqueta))];
          return (
            <li key={v.id} id={ancla(v.version)} className="nv-item">
              <time className="nv-fecha" dateTime={v.fecha_publicacion}>{fechaCorta(v.fecha_publicacion)}</time>
              <span className="nv-punto" aria-hidden="true" />
              <div className="nv-cuerpo">
                <h2><a href={`#${ancla(v.version)}`}>{v.titulo}</a></h2>
                <ul className="nv-cambios">{lista.map((c) => <li key={c.id}>{c.texto}</li>)}</ul>
                {v.cambios.length > POR_VERSION && (
                  <button type="button" className="nv-mas" onClick={() => setAbiertas((p) => { const n = new Set(p); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; })}>
                    {todas ? 'Ver menos' : `Ver los ${v.cambios.length} cambios`}
                  </button>
                )}
                <p className="nv-etiquetas">
                  <span className="nv-version">Versión {v.version}</span>
                  {tipos.map((t) => (
                    <span key={t} className="nv-chip">
                      {t in ICONO_ETIQUETA && <Sparkles size={11} aria-hidden="true" />}
                      {ETIQUETA[t] ?? 'Mejora'}
                    </span>
                  ))}
                </p>
              </div>
            </li>
          );
        })}
        {visibles.length === 0 && <li className="nv-vacio">No hay novedades de este tipo.</li>}
      </ol>

      <aside className="nv-filtro" aria-label="Filtrar novedades">
        <p>Filtrar</p>
        <div role="radiogroup" aria-label="Tipo de cambio">
          {FILTROS.map((f) => (
            <label key={f.id}>
              <input type="radio" name="filtro-novedades" checked={filtro === f.id} onChange={() => setFiltro(f.id)} />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}
