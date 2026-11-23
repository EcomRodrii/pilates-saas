import Link from 'next/link';
import { urlArticulo, type ArticuloAyuda } from '@/lib/ayuda/registro';

// «Artículos relacionados» como lista de enlaces subrayados, sin tarjetas (así lo cierra una guía de Shopify).
export function AyudaRelacionados({ articulos }: { articulos: ArticuloAyuda[] }) {
  if (articulos.length === 0) return null;
  return (
    <section style={{ margin: '36px 0 8px' }} aria-labelledby="ay-relacionados">
      <h2 id="ay-relacionados" style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Artículos relacionados</h2>
      <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14.5 }}>
        {articulos.map((a) => (
          <li key={`${a.categoria}/${a.slug}`}>
            <Link href={urlArticulo(a)} style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: '#b5b5b5' }}>{a.titulo}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
