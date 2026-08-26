import { cn } from '@/lib/utils';
import { NW_TINTA, NW_MUTED_2, NW_PRODUCTO } from '@/components/network-v2/tokens';

// `FilaStat`/`Seccion` de la ficha de instructora, compartidos entre la
// pública (app/network/instructoras/[slug]/page.tsx, siempre fuera de
// .dark, tokens NW_* de components/network-v2/tokens.ts) y la del panel
// (app/(dashboard)/network/[perfilId]/page.tsx, dentro de (dashboard),
// puede llevar .dark — lib/panel-theme.tsx). Antes eran dos copias
// idénticas por diseño con dos paletas distintas — mismo criterio de
// `tokensNetworkV2` que ya usa components/network/seccion-experiencia.tsx:
// un componente, no dos que hay que mantener sincronizados a mano.
//
// Comportamiento preservado tal cual de cada original: la pública admite
// `destacado`/`compacta` y nunca lleva borde; el panel no usa esas dos
// variantes hoy (siempre `border-t border-border pt-5`), pero los props
// quedan aceptados por si algún día el panel también los necesita.

export function FilaStat({
  valor, etiqueta, destacado = false, tokensNetworkV2 = false,
}: {
  valor: string;
  etiqueta: string;
  destacado?: boolean;
  tokensNetworkV2?: boolean;
}) {
  if (tokensNetworkV2) {
    return (
      <div>
        <p
          className={destacado ? 'text-[22px] font-extrabold' : 'text-[18px] font-bold'}
          style={{ color: destacado ? NW_PRODUCTO : NW_TINTA }}
        >
          {valor}
        </p>
        <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>{etiqueta}</p>
      </div>
    );
  }
  return (
    <div>
      <p className={cn('font-extrabold', destacado ? 'text-[20px] text-brand' : 'text-[16px] text-foreground')}>{valor}</p>
      <p className="text-[11.5px] text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

export function Seccion({
  titulo, children, compacta = false, tokensNetworkV2 = false,
}: {
  titulo: string;
  children: React.ReactNode;
  compacta?: boolean;
  tokensNetworkV2?: boolean;
}) {
  if (tokensNetworkV2) {
    return (
      <section>
        <h2
          className={compacta ? 'text-[15px] font-bold uppercase tracking-wide' : 'text-[22px] font-extrabold'}
          style={{ color: compacta ? NW_MUTED_2 : NW_TINTA }}
        >
          {titulo}
        </h2>
        <div className="mt-3">{children}</div>
      </section>
    );
  }
  return (
    <section className="border-t border-border pt-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
