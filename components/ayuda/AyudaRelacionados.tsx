import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { categoriaDe, urlArticulo, type ArticuloAyuda } from '@/lib/ayuda/registro';
import { MUTED } from '@/components/landing/theme';

export function AyudaRelacionados({ articulos }: { articulos: ArticuloAyuda[] }) {
  if (articulos.length === 0) return null;
  return (
    <div style={{ margin: '40px 0 8px' }}>
      <p className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 14 }}>Artículos relacionados</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
        {articulos.map((a) => (
          <Link
            key={`${a.categoria}/${a.slug}`}
            href={urlArticulo(a)}
            className="ayuda-relacionado"
            style={{ display: 'block', border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 16px', textDecoration: 'none', color: 'inherit' }}
          >
            <p className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', margin: '0 0 6px' }}>{categoriaDe(a.categoria)?.titulo}</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{a.titulo}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, fontWeight: 600, color: MUTED }}>
              Leer <ArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
      <style>{`.ayuda-relacionado{transition:border-color .15s,transform .15s}.ayuda-relacionado:hover{border-color:#343825;transform:translateY(-2px)}`}</style>
    </div>
  );
}
