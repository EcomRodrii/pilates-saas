import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Miga { label: string; href?: string }

// Migas de pan visibles (navegación real) — el JSON-LD equivalente vive en
// AyudaStructuredData.tsx, con las mismas etiquetas para no decir dos cosas.
// Con la forma de las de Shopify: enlaces subrayados en gris y la página actual sin enlace.
export function AyudaBreadcrumbs({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Miga de pan" className="ay-migas">
      {items.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <ChevronRight size={12} aria-hidden />}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span style={{ color: '#303030' }}>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
