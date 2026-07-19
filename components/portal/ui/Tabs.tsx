'use client';

import { useModo } from '@/lib/portal-modo';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Scroll horizontal en vez de repartir el ancho — para 4+ pestañas con texto largo. */
  scroll?: boolean;
}

// Segmented control para navegar entre vistas de una misma pantalla (Próximas/
// Pasadas/Canceladas...). Altura mínima 44px en cada pestaña — antes 28-32px.
export function Tabs<T extends string>({ items, active, onChange, scroll = false }: TabsProps<T>) {
  const { t } = useModo();
  return (
    <div
      style={{
        display: 'flex', gap: scroll ? 8 : 4, padding: scroll ? 0 : 4,
        borderRadius: scroll ? 0 : 18, background: scroll ? 'transparent' : t.surface2,
        overflowX: scroll ? 'auto' : 'visible', scrollbarWidth: 'none',
      }}
    >
      {items.map(item => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            style={{
              flex: scroll ? undefined : 1, flexShrink: scroll ? 0 : undefined,
              minHeight: 44, padding: scroll ? '0 14px' : 0, borderRadius: 14,
              fontSize: 12.5, fontWeight: 800, border: scroll ? `1px solid ${isActive ? 'var(--portal-brand)' : t.line}` : 'none',
              background: scroll ? (isActive ? 'var(--portal-brand)' : t.surface2) : (isActive ? t.surface : 'transparent'),
              color: scroll ? (isActive ? 'var(--portal-brand-foreground)' : t.muted) : (isActive ? t.ink : t.muted),
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
            {item.count != null && item.count > 0 ? ` (${item.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}
