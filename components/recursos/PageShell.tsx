import { GlobalStyles } from '@/components/landing/GlobalStyles';

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    // Fondo Cream y tinta Ink de la web (components/web/tokens.css, fase 3): el gris
    // piedra de antes se retira sección a sección, y el blog es la suya.
    <div style={{ background: 'var(--w-cream)', color: 'var(--w-texto)', overflowX: 'clip', position: 'relative' }}>
      {children}
      <GlobalStyles />
    </div>
  );
}
