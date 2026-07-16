// I3 · Skeleton genérico del panel. Se muestra mientras los datos del estudio se
// cargan (studio === null en el layout), para no pintar estados vacíos falsos
// ("Sin recibos", "No hay resultados") que hacían parecer la app rota/vacía en
// cada carga en frío. Neutro y ligero: una cabecera + una rejilla de tarjetas +
// unas filas, que encaja con casi todas las páginas del panel.

function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-foreground/10 ${className}`} aria-hidden="true" />;
}

export function PanelSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Cargando…">
      {/* Cabecera */}
      <div className="space-y-2">
        <Bloque className="h-7 w-48" />
        <Bloque className="h-4 w-72" />
      </div>

      {/* Fila de tarjetas/metricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bloque key={i} className="h-24 w-full" />
        ))}
      </div>

      {/* Bloque de tabla/lista */}
      <div className="space-y-3">
        <Bloque className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bloque key={i} className="h-12 w-full" />
        ))}
      </div>

      <span className="sr-only">Cargando datos del estudio…</span>
    </div>
  );
}
