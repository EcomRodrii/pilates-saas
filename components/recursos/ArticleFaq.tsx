import { ACC, ACC_SOFT } from '@/components/landing/theme';

// Preguntas frecuentes de las páginas públicas (guías, funcionalidades,
// soluciones, comparativas).
//
// ⚠️ Con <details>, no con un estado de React. Hasta el 7-oct-2026 la respuesta
// solo se pintaba al pulsar la pregunta: en el HTML que lee Google —y que leen
// los buscadores con IA— no había ninguna respuesta, solo la pregunta, mientras
// el JSON-LD FAQPage de la misma página declaraba las respuestas completas.
// Contenido marcado que no está en la página es justo lo que Google pide no
// hacer. Ahora la respuesta va siempre en el HTML y el navegador la pliega; sin
// JavaScript también se abre.
export function ArticleFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="afaq">
      {items.map((item) => (
        <details key={item.q} className="afaq-item">
          <summary className="afaq-q">
            <span>{item.q}</span>
            <span className="afaq-signo" aria-hidden>+</span>
          </summary>
          <p className="afaq-a">{item.a}</p>
        </details>
      ))}
      <style>{`
        .afaq { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
        .afaq-item { background: #fff; border: 1px solid #E7E7E0; border-radius: 14px; overflow: hidden; }
        .afaq-q { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          cursor: pointer; padding: 17px 20px; font-size: 15.5px; font-weight: 700; line-height: 1.4; color: #1A1A1A; }
        .afaq-q::-webkit-details-marker { display: none; }
        .afaq-q:focus-visible { outline: 2px solid ${ACC}; outline-offset: -2px; border-radius: 14px; }
        .afaq-signo { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: ${ACC_SOFT}; color: ${ACC};
          display: flex; align-items: center; justify-content: center; font-size: 17px; transition: transform .2s; }
        .afaq-item[open] .afaq-signo { transform: rotate(45deg); }
        .afaq-a { margin: 0; padding: 0 20px 18px; font-size: 14.5px; line-height: 1.6; color: #5A5A52; }
        @media (prefers-reduced-motion: reduce) { .afaq-signo { transition: none; } }
      `}</style>
    </div>
  );
}
