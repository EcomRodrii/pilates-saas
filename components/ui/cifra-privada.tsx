'use client';

import { usePanelPrivacy } from '@/lib/panel-privacy';
import { cn } from '@/lib/utils';

// Envuelve una cifra económica visible "de un vistazo" (ingresos, KPIs,
// importes de tabla). Con el modo privacidad activado se difumina en el
// sitio, sin cambiar el layout — así una tabla de importes no salta al
// activarlo. `inline` para números sueltos dentro de una frase o de un <td>.
function CifraPrivada({
  children,
  className,
  style,
  inline = false,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  inline?: boolean;
}) {
  const { oculto } = usePanelPrivacy();
  const Tag = inline ? 'span' : 'div';
  return (
    <Tag className={cn(oculto && 'blur-sm select-none', className)} style={style}>
      {children}
    </Tag>
  );
}

export { CifraPrivada };
