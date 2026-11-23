'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Search, X } from 'lucide-react';
import { buscarArticulos } from '@/lib/ayuda/busqueda';

// «Pregunta sobre este artículo»: la barra fija de abajo de las guías de Shopify. ⚠️ En Shopify contesta una IA; aquí NO hay IA que
// conteste (sería un modelo expuesto sin sesión: coste y abuso, decisión pendiente del fundador): la pregunta se busca en la ayuda y
// salen las guías que la responden, las de esta categoría primero. Lo dice el rótulo, para que nadie espere una respuesta redactada.
export function AyudaPregunta({ categoria, actual }: { categoria: string; actual: string }) {
  const [q, setQ] = useState('');
  const [enviada, setEnviada] = useState('');
  const resultados = useMemo(() => {
    if (!enviada) return [];
    const r = buscarArticulos(enviada).filter((x) => x.href !== actual);
    return [...r.filter((x) => x.articulo.categoria === categoria), ...r.filter((x) => x.articulo.categoria !== categoria)].slice(0, 5);
  }, [enviada, categoria, actual]);

  return (
    <div className="ay-pregunta">
      {enviada && (
        <div className="ay-pregunta-panel" role="region" aria-label="Guías que responden a tu pregunta">
          <div className="ay-pregunta-cab">
            <span>{resultados.length > 0 ? 'Guías que responden a tu pregunta' : `Sin resultados para «${enviada}»`}</span>
            <button type="button" aria-label="Cerrar" onClick={() => { setEnviada(''); setQ(''); }}><X size={15} aria-hidden="true" /></button>
          </div>
          {resultados.length > 0 ? (
            <ul>{resultados.map((r) => <li key={r.href}><Link href={r.href}><small>{r.categoriaTitulo}</small>{r.articulo.titulo}</Link></li>)}</ul>
          ) : <p>Prueba con otras palabras, o escribe a una persona con «Chat humano».</p>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); setEnviada(q.trim()); }} role="search">
        <Search size={15} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pregunta sobre este artículo" aria-label="Pregunta sobre este artículo" />
        <button type="submit" aria-label="Buscar en la ayuda" disabled={!q.trim()}><ArrowUp size={15} aria-hidden="true" /></button>
      </form>
    </div>
  );
}
