'use client';

import { Card, CardContent } from '@/components/ui/card';

// "Mientras dormías" (Bible doc 4 §): solo hechos verificados — si la ventana
// está vacía, la sección se omite (nunca "no hice nada" ni relleno inventado).
export function WhileYouSlept({ items }: { items: { icono: string; texto: string; verificadoPor: string }[] }) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-foreground">Mientras dormías, esto es lo que hice</h3>
          <p className="text-[12px] text-muted-foreground">Cosas de rutina que ya no tienes que tocar.</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug text-foreground">
              <span className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} aria-hidden>{item.icono}</span>
              <span title={item.verificadoPor}>{item.texto}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
