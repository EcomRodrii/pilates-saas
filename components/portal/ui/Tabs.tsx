'use client';

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
//
// Valores literales del sistema "Tentare Studio App" — antes venían de
// `useModo()`, la paleta del diseño anterior ya sustituido. Sin captura de
// referencia directa para este segmented control (ninguna de las 20 de
// docs/diseno-referencia-portal/ lo cubre), así que se conserva su estructura
// actual — solo cambian los colores, no el treatment (p.ej. Horario usa una
// píldora deslizante distinta, pero esa sí tiene captura propia).
export function Tabs<T extends string>({ items, active, onChange, scroll = false }: TabsProps<T>) {
  return (
    <div
      style={{
        display: 'flex', gap: scroll ? 8 : 4, padding: scroll ? 0 : 4,
        borderRadius: scroll ? 0 : 18, background: scroll ? 'transparent' : '#EFEDE4',
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
              fontSize: 12.5, fontWeight: 800, border: scroll ? `1px solid ${isActive ? 'var(--ap-tinta, #1A1A1A)' : '#E5E3DA'}` : 'none',
              background: scroll ? (isActive ? 'var(--ap-tinta, #1A1A1A)' : '#EFEDE4') : (isActive ? '#FFFFFF' : 'transparent'),
              color: scroll ? (isActive ? '#F1ECE1' : '#5A5A52') : (isActive ? '#1A1A1A' : '#5A5A52'),
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
