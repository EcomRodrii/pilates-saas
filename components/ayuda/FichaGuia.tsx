'use client';

import { useEffect, useState } from 'react';
import { Check, Layers } from 'lucide-react';
import { capturarEvento } from '@/lib/posthog-cliente';
import { leerHechas, marcarHecha, type FichaGuia as FichaDeGuia } from '@/lib/ayuda/academy';
import { NIVELES, type VideoAyuda } from '@/lib/ayuda/videos';
import { VideoFachada } from './VideoFachada';
import './academy.css';

export interface RutaDeLaGuia { titulo: string; posicion: number; total: number }

// La cabecera de una guía en Academy: su vídeo (si hay uno publicado), el nivel, a qué ruta pertenece, «lo que vas a conseguir» y
// «marcar como hecha». Todo es opcional: una guía sin ficha, sin vídeo y sin ruta no pinta nada aquí (solo cuenta la visita), nunca
// un hueco ni un «próximamente».
//
// ⚠️ «Hecha» es lo que esta persona ha leído, en su navegador (`lib/ayuda/academy.ts`). No configura nada ni cuenta como progreso del
// estudio: ese lo calcula `lib/guia/progreso.ts` de datos reales.
export function FichaGuia({ clave, ficha, video, ruta }: { clave: string; ficha: FichaDeGuia | null; video: VideoAyuda | null; ruta: RutaDeLaGuia | null }) {
  const [hecha, setHecha] = useState(false);

  useEffect(() => {
    capturarEvento('ayuda_articulo_visto', { articulo: clave });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee el navegador (localStorage) tras montar: en el servidor no existe.
    setHecha(leerHechas(window.localStorage).has(clave));
  }, [clave]);

  function alternar() {
    const nueva = !hecha;
    setHecha(nueva);
    marcarHecha(window.localStorage, clave, nueva);
    capturarEvento('ayuda_guia_hecha', { articulo: clave, hecha: nueva });
  }

  if (!ficha && !video && !ruta) return null;
  const nivel = video?.nivel ?? ficha?.nivel;
  const resultado = video?.resultado ?? ficha?.resultado ?? null;

  return (
    <section className="ac-ficha" aria-label="Sobre esta guía">
      {video && <VideoFachada video={video} />}
      <div className="ac-ficha-fila">
        {nivel && <span className="ac-pildora">{NIVELES[nivel]}</span>}
        {ruta && <span className="ac-pildora"><Layers size={13} aria-hidden="true" /> {ruta.titulo} · {ruta.posicion} de {ruta.total}</span>}
      </div>
      {resultado && <p className="ac-resultado"><strong>Lo que vas a conseguir:</strong> {resultado}</p>}
      {ruta && (
        <div>
          <button type="button" className="ac-hecha" aria-pressed={hecha} onClick={alternar}>
            <Check size={15} aria-hidden="true" /> {hecha ? 'Guía hecha' : 'Marcar como hecha'}
          </button>
        </div>
      )}
    </section>
  );
}
