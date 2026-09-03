import { parsearTextoRico, tieneMarcas } from '@/lib/theme/texto-rico';
import { resolverHrefBloque } from '@/lib/portal-home-bloques';

// Pinta un texto con negrita, cursiva y enlaces.
//
// ⚠️ NUNCA `dangerouslySetInnerHTML`. Ese es el motivo entero de que el
// formato guardado no sea HTML: aquí se construyen elementos de React a
// partir de nodos ya interpretados, así que un `<script>` escrito en el campo
// sale como texto literal en vez de ejecutarse. Ver el comentario de cabecera
// de `lib/theme/texto-rico.ts`.

/** El mismo guardia de enlaces que banner y CTA — uno solo, no dos criterios. */
function href(v: string): string | null {
  return resolverHrefBloque(v)?.valor ?? null;
}

export function TextoRico({ texto, className, style }: {
  texto: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Sin marcas no se parsea: la inmensa mayoría de los textos guardados son
  // planos y no tiene sentido recorrerlos con un regex en cada render.
  if (!tieneMarcas(texto)) return <span className={className} style={style}>{texto}</span>;

  return (
    <span className={className} style={style}>
      {parsearTextoRico(texto, href).map((n, i) => {
        // `i` como key: los nodos no tienen identidad propia y la lista se
        // reconstruye entera en cada cambio del texto — no hay reordenación
        // que pueda confundir a React.
        if (n.tipo === 'negrita') return <strong key={i}>{n.texto}</strong>;
        if (n.tipo === 'cursiva') return <em key={i}>{n.texto}</em>;
        if (n.tipo === 'enlace') {
          const externo = !n.href.startsWith('/');
          return (
            <a
              key={i}
              href={n.href}
              // `noopener` en los externos: sin él, la página destino puede
              // tocar `window.opener`. Es el mismo criterio que el resto de
              // enlaces salientes del portal.
              {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              {n.texto}
            </a>
          );
        }
        return <span key={i}>{n.texto}</span>;
      })}
    </span>
  );
}
