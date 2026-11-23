'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Entrada al hacer scroll (sube y aparece). Sin JS o con «reducir movimiento» se ve todo desde el principio.
export function Revelar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisto(true); return; } // eslint-disable-line react-hooks/set-state-in-effect -- decide al montar, no en render
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisto(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`ed-revelar${visto ? ' ed-revelar--ya' : ''}`}>{children}</div>;
}
