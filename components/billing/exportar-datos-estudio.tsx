'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { cn } from '@/lib/utils';

// "Tus datos son tuyos" — un CSV por tabla, no un backup restaurable: esto es
// para llevarse los datos a otro sitio, no para recuperar el estudio. Fetch +
// blob, no un <a href> directo: la API exige el JWT en un header Authorization,
// que un enlace no puede mandar.
//
// Vive aquí y no solo en Configuración → Copias de seguridad porque un estudio
// con la prueba agotada NO llega al panel (dashboard-shell lo manda a
// /suscripcion), y es justo a quien el aviso de borrado le dice «exporta tus
// datos». La API (/api/exportar/mis-datos) solo exige sesión de PROPIETARIO, sin
// gate de suscripción, así que desde /suscripcion funciona igual.
const EXPORTABLES: { tabla: string; label: string }[] = [
  { tabla: 'clientas', label: 'Clientas' },
  { tabla: 'reservas', label: 'Reservas y asistencia' },
  { tabla: 'suscripciones', label: 'Suscripciones y bonos' },
  { tabla: 'recibos', label: 'Recibos' },
  { tabla: 'pagos_historicos', label: 'Pagos históricos importados' },
];

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function ExportarDatosEstudio({ id, className }: { id?: string; className?: string }) {
  const [exportando, setExportando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // El enlace del email llega a `#exportar-datos`, pero la página se pinta en
  // cliente tras cargar la sesión: cuando el navegador intentó saltar al ancla,
  // este bloque aún no existía. Se hace el salto al montar.
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) ref.current?.scrollIntoView({ block: 'start' });
  }, [id]);

  async function exportarTabla(tabla: string) {
    setExportando(tabla);
    setError(null);
    try {
      const res = await fetch(`/api/exportar/mis-datos?tabla=${tabla}`, { headers: await authHeader() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo generar la exportación');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${tabla}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError('Error de conexión');
    } finally {
      setExportando(null);
    }
  }

  return (
    <section ref={ref} id={id} aria-labelledby={id ? `${id}-titulo` : undefined} className={cn('space-y-3 scroll-mt-6', className)}>
      <div className="flex items-center gap-2">
        <Download size={16} className="text-brand-secondary" aria-hidden="true" />
        <h3 id={id ? `${id}-titulo` : undefined} className="text-[14px] font-semibold text-foreground">Exportar datos del estudio</h3>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Un CSV por tabla, listo para abrir en Excel o llevarte a otra plataforma. No incluye ficha clínica ni notas de progreso.
      </p>
      <div className="flex flex-wrap gap-2">
        {EXPORTABLES.map(e => (
          <button
            key={e.tabla}
            onClick={() => void exportarTabla(e.tabla)}
            disabled={exportando === e.tabla}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            {exportando === e.tabla ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {e.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-[12px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
    </section>
  );
}
