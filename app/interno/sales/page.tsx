'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useSesionInterna } from '../layout.tsx';
import { authHeader } from '@/lib/api-client.ts';
import type { RowSalesLeads } from '@/lib/db-types';

type SalesLead = RowSalesLeads;

const ESTADOS_PIPELINE = ['NUEVO', 'INVESTIGANDO', 'LISTO', 'CONTACTADO'] as const;

export default function PageSalesOS() {
  const _sesion = useSesionInterna();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ Auditoría 2026-09-21: estos dos `fetch` NO mandaban la cabecera
  // `Authorization`, y las dos rutas la exigen (`comprobarAdminInterno` lee
  // `authorization` y no cae a cookie). Siempre respondían 403, y como el
  // resultado se leía con `data.leads || []` el tablero quedaba vacío: no
  // «no tienes permiso», sino «todavía no hay leads». El arrastre tampoco
  // persistía nunca. El resto de /interno ya pasa por `lib/interno/client.ts`,
  // que añade `authHeader()`; aquí se hacía `fetch` a pelo.
  const cargarLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: '200',
        ...(search && { search }),
      });
      const resp = await fetch(`/api/interno/sales/leads?${params}`, {
        headers: { ...(await authHeader()) },
      });
      if (!resp.ok) {
        const cuerpo = await resp.json().catch(() => null) as { error?: string } | null;
        setError(resp.status === 403
          ? (cuerpo?.error ?? 'No tienes permiso para ver los leads.')
          : 'No se han podido cargar los leads.');
        setLeads([]);
        return;
      }
      const data = await resp.json();
      setLeads(data.leads || []);
    } catch (error) {
      console.error('Error cargando leads:', error);
      setError('No se han podido cargar los leads.');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Auditoría 2026-09-16 (FE-14): el `clearTimeout` cancela el temporizador,
  // no el `fetch` ya lanzado — dos búsquedas seguidas podían pintar la
  // respuesta de la primera encima de la segunda. Es el único fetch-en-effect
  // dependiente de un valor que cambia por tecla sin la guarda `vivo` que usa
  // el resto del repo (hoy-en-el-estudio.tsx, hilo-mensajes.tsx...).
  useEffect(() => {
    let vivo = true;
    const timer = setTimeout(() => { if (vivo) void cargarLeads(); }, 300);
    return () => { vivo = false; clearTimeout(timer); };
  }, [search, cargarLeads]);

  const leadsPorEstado: Record<string, SalesLead[]> = {};
  ESTADOS_PIPELINE.forEach(estado => {
    leadsPorEstado[estado] = leads.filter(l => l.estado === estado);
  });

  const handleDragStart = (e: React.DragEvent, lead: SalesLead) => {
    e.dataTransfer.setData('leadId', lead.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, nuevoEstado: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');

    try {
      const resp = await fetch(`/api/interno/sales/leads/${leadId}/estado`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ nuevo_estado: nuevoEstado }),
      });

      if (resp.ok) {
        setError(null);
        cargarLeads();
      } else {
        // Sin esto, una tarjeta rechazada por el servidor volvía a su sitio
        // sin decir nada y parecía un fallo del arrastre.
        const cuerpo = await resp.json().catch(() => null) as { error?: string } | null;
        setError(cuerpo?.error ?? 'No se ha podido mover el lead.');
      }
    } catch (error) {
      console.error('Error moviendo lead:', error);
      setError('No se ha podido mover el lead.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sales OS</h1>
          <p className="text-sm text-muted-foreground mt-1">CRM de captación de estudios</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Lead
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Búsqueda */}
      <div className="flex gap-2">
        <Search className="w-4 h-4 text-muted-foreground mt-2.5" />
        <Input
          placeholder="Buscar por nombre, ciudad, email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-96"
        />
        <span className="text-sm text-muted-foreground mt-2.5">
          {leads.length} leads
        </span>
      </div>

      {/* Pipeline Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {ESTADOS_PIPELINE.map(estado => (
          <div
            key={estado}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, estado)}
            className="bg-muted rounded-lg p-4 min-h-[500px] border-2 border-dashed border-muted-foreground/20"
          >
            <h2 className="font-semibold text-sm mb-4">
              {estado}
              <span className="ml-2 text-xs text-muted-foreground">
                {leadsPorEstado[estado]?.length || 0}
              </span>
            </h2>

            <div className="space-y-2">
              {(leadsPorEstado[estado] || []).map(lead => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={e => handleDragStart(e, lead)}
                  className="bg-white border rounded-md p-3 cursor-move hover:shadow-md transition-shadow"
                >
                  <p className="text-sm font-medium truncate">
                    {lead.estudio_nombre || lead.nombre_contacto || lead.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.email}
                  </p>
                  {lead.ciudad && (
                    <p className="text-xs text-muted-foreground">
                      {lead.ciudad}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground">Cargando...</p>}
    </div>
  );
}
