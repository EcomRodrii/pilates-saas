import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Miga { label: string; href?: string }

// Migas de pan visibles (navegación real) — el JSON-LD equivalente vive en
// AyudaStructuredData.tsx, con las mismas etiquetas para no decir dos cosas.
export function AyudaBreadcrumbs({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Miga de pan" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8E8E86', marginBottom: 18 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronRight size={12} aria-hidden />}
          {item.href ? <Link href={item.href} style={{ color: '#8E8E86' }} className="hover:text-[#1A1A1A]">{item.label}</Link> : <span style={{ color: '#5A5A52' }}>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
