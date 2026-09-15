'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { useSesionInterna } from '../layout.tsx';
import type { RowSalesLeads } from '@/lib/db-types';

type SalesLead = RowSalesLeads;

const ESTADOS_PIPELINE = ['NUEVO', 'INVESTIGANDO', 'LISTO', 'CONTACTADO'] as const;

export default function PageSalesOS() {
  const _sesion = useSesionInterna();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const cargarLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: '200',
        ...(search && { search }),
      });
      const resp = await fetch(`/api/interno/sales/leads?${params}`);
      const data = await resp.json();
      setLeads(data.leads || []);
    } catch (error) {
      console.error('Error cargando leads:', error);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => cargarLeads(), 300);
    return () => clearTimeout(timer);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nuevo_estado: nuevoEstado }),
      });

      if (resp.ok) {
        cargarLeads();
      }
    } catch (error) {
      console.error('Error moviendo lead:', error);
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
