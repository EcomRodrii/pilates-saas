import Image from 'next/image';
import Link from 'next/link';
import { SOLUCIONES, CARACTERISTICAS, COMPARATIVAS } from '@/lib/marketing-nav';

interface Col {
  title: string;
  links: { href: string; label: string }[];
}

// Footer profesional de 6 columnas — antes era solo un logo + copyright, sin
// un solo enlace (app/page.tsx). Cada columna aterriza en contenido real: las
// páginas "en construcción" están marcadas como tal desde el propio enlace
// para que nadie llegue esperando algo que no hay (ver EMPRESA/RECURSOS abajo).
export function MarketingFooter() {
  const columnas: Col[] = [
    {
      title: 'Diseñado para',
      links: SOLUCIONES.map(s => ({ href: `/soluciones#${s.slug}`, label: s.label })),
    },
    {
      title: 'Características',
      links: CARACTERISTICAS.map(c => ({ href: `/caracteristicas#${c.slug}`, label: c.label })),
    },
    {
      title: 'Comparativas',
      links: COMPARATIVAS.map(c => ({ href: `/comparativas/${c.slug}`, label: `Tentare vs ${c.nombre}` })),
    },
    {
      title: 'Empresa',
      links: [
        { href: '/empresa/sobre-nosotros', label: 'Sobre nosotros' },
        { href: '/empresa/recomienda', label: 'Recomienda un cliente' },
        { href: '/empresa/carreras', label: 'Carreras' },
        { href: '/empresa/contacto', label: 'Contacto' },
      ],
    },
    {
      title: 'Recursos',
      links: [
        { href: '/recursos/testimonios', label: 'Testimonios' },
        { href: '/recursos/blog', label: 'Blog' },
        { href: '/recursos/guias', label: 'Guías' },
        { href: '/recursos/informes', label: 'Informes' },
        { href: '/recursos/centro-de-ayuda', label: 'Centro de ayuda' },
        { href: '/recursos/faq', label: 'FAQ' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/legal/aviso-legal', label: 'Aviso legal' },
        { href: '/legal/privacidad', label: 'Política de privacidad' },
        { href: '/legal/cookies', label: 'Cookies' },
        { href: '/legal/seguridad', label: 'Seguridad' },
        { href: '/legal/terminos', label: 'Términos' },
      ],
    },
  ];

  return (
    <footer style={{ background: '#0F0F0F', color: '#8E8E86', padding: '64px 40px 32px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div
          className="mkt-footer-grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 32, marginBottom: 48 }}
        >
          <div style={{ gridColumn: 'span 1' }}>
            <Image src="/logo-mark.png" alt="Tentare" width={32} height={32} style={{ height: 32, width: 'auto', marginBottom: 14 }} />
            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#6B6B64', maxWidth: 200, margin: 0 }}>
              Software para estudios de Pilates. Hecho en España.
            </p>
          </div>
          {columnas.map(col => (
            <div key={col.title}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#E8E8E4', marginBottom: 16 }}>
                {col.title}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(l => (
                  <li key={l.href}>
                    <Link href={l.href} style={{ fontSize: 13.5, color: '#8E8E86', textDecoration: 'none' }} className="mkt-footer-link">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.08)',
            paddingTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 13,
          }}
        >
          <span>© {new Date().getFullYear()} Tentare · Software para estudios de Pilates</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/legal/privacidad" style={{ color: '#8E8E86', textDecoration: 'none' }}>Privacidad</Link>
            <Link href="/legal/terminos" style={{ color: '#8E8E86', textDecoration: 'none' }}>Términos</Link>
            <Link href="/legal/cookies" style={{ color: '#8E8E86', textDecoration: 'none' }}>Cookies</Link>
          </div>
        </div>
      </div>
      <style>{`
        .mkt-footer-link:hover { color: #FFC8E2 !important; }
        @media (max-width: 900px) {
          .mkt-footer-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 560px) {
          .mkt-footer-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </footer>
  );
}
