'use client';

import { useState } from 'react';
import { DatabaseBackup, RotateCcw, ShieldAlert, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { BackupMeta, TipoBackup } from '@/lib/types';
import { btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

const TIPO_LABEL: Record<TipoBackup, { label: string; bg: string; text: string }> = {
  DIARIO: { label: 'Diario', bg: '#EAF6FF', text: '#0369A1' },
  SEMANAL: { label: 'Semanal', bg: '#F3EEFF', text: '#7C3AED' },
  MENSUAL: { label: 'Mensual', bg: '#ECFDF5', text: '#059669' },
  MANUAL: { label: 'Manual', bg: '#FFFBEB', text: '#B45309' },
};

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function TabBackups({ showToast }: { showToast: (m: string) => void }) {
  const { backups } = useStudio();
  const rol = useRol();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState<BackupMeta | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [ejecutandoRestore, setEjecutandoRestore] = useState(false);

  if (rol !== 'PROPIETARIO') {
    return (
      <div className={cn(cardCls, 'p-8 text-center max-w-lg')}>
        <ShieldAlert size={24} className="text-[#A8A89F] mx-auto mb-2" />
        <p className="text-[13px] text-[#8E8E86]">Solo la propietaria puede gestionar copias de seguridad.</p>
      </div>
    );
  }

  async function crearBackup() {
    setCreando(true);
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/backups/create', { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo crear la copia de seguridad');
        return;
      }
      showToast('Copia de seguridad creada');
      window.location.reload();
    } catch {
      setError('Error de conexión');
    } finally {
      setCreando(false);
    }
  }

  async function confirmarRestaurar() {
    if (!restaurando || confirmText !== 'RESTAURAR') return;
    setEjecutandoRestore(true);
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeader()) };
      const res = await fetch('/api/backups/restore', {
        method: 'POST', headers, body: JSON.stringify({ backupId: restaurando.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo restaurar la copia');
        setEjecutandoRestore(false);
        return;
      }
      window.location.reload();
    } catch {
      setError('Error de conexión');
      setEjecutandoRestore(false);
    }
  }

  const ordenados = [...backups].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DatabaseBackup size={16} className="text-[#B57A8E]" />
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Copias de seguridad</h3>
        </div>
        <button onClick={crearBackup} disabled={creando} className={btnPrimary}>
          {creando ? <Loader2 size={14} className="animate-spin" /> : <DatabaseBackup size={14} />}
          {creando ? 'Creando…' : 'Crear copia ahora'}
        </button>
      </div>
      <p className="text-[12px] text-[#8E8E86]">
        Todos los días se crea automáticamente una copia diaria (los lunes también semanal, y el día 1 de cada mes también mensual) — en segundo plano, sin interrumpir la app. Restaurar sobrescribe todos los datos actuales del negocio.
      </p>
      {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {ordenados.length === 0 ? (
        <div className={cn(cardCls, 'p-8 text-center')}>
          <p className="text-[13px] text-[#8E8E86]">Todavía no hay copias de seguridad.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map(b => {
            const tipo = TIPO_LABEL[b.tipo];
            return (
              <div key={b.id} className={cn(cardCls, 'p-4 flex items-center gap-3')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: tipo.bg, color: tipo.text }}>
                      {tipo.label}
                    </span>
                    <p className="text-[13px] font-semibold text-[#1A1A1A]">
                      {new Date(b.creadoEn).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setRestaurando(b); setConfirmText(''); setError(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E7E7E0] text-[12px] font-medium text-[#3A3A34] hover:bg-[#F5F5F1] transition-colors shrink-0"
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!restaurando} onOpenChange={open => !open && setRestaurando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Restaurar esta copia de seguridad?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[13px] text-[#5A5A52]">
              Esto <strong>sobrescribirá todos los datos actuales</strong> del negocio (socias, reservas, cobros, todo) con los de{' '}
              {restaurando && new Date(restaurando.creadoEn).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
              Es irreversible salvo que exista otra copia posterior.
            </p>
            <p className="text-[12px] text-[#8E8E86]">Escribe <strong>RESTAURAR</strong> para confirmar.</p>
            <input
              className="w-full rounded-lg border border-[#E7E7E0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="RESTAURAR"
            />
            {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setRestaurando(null)} className={btnSecondary}>Cancelar</button>
              <button
                onClick={confirmarRestaurar}
                disabled={confirmText !== 'RESTAURAR' || ejecutandoRestore}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-40 flex items-center gap-1.5"
              >
                {ejecutandoRestore && <Loader2 size={14} className="animate-spin" />}
                Restaurar y sobrescribir
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
