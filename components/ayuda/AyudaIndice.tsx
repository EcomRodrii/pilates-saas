'use client';

import { useEffect, useState } from 'react';

// «En esta página»: los apartados (h2) del cuerpo de la guía, con enlace a cada uno. Se lee del DOM al montar porque el cuerpo de
// cada guía es un componente aparte; con menos de tres apartados no se pinta (una guía corta no necesita índice).
const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function AyudaIndice() {
  const [items, setItems] = useState<{ id: string; texto: string }[]>([]);
  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLHeadingElement>('.ay-cuerpo h2')];
    const usados = new Set<string>();
    const lista = hs.map((h, i) => {
      let id = h.id || slug(h.textContent ?? '') || `apartado-${i + 1}`;
      while (usados.has(id)) id += '-2';
      usados.add(id); h.id = id;
      return { id, texto: h.textContent ?? '' };
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el índice sale del DOM ya montado
    setItems(lista);
  }, []);
  if (items.length < 3) return null;
  return (
    <nav className="ay-indice" aria-label="En esta página">
      <h2>En esta página</h2>
      <ul>{items.map((i) => <li key={i.id}><a href={`#${i.id}`}>{i.texto}</a></li>)}</ul>
    </nav>
  );
}
