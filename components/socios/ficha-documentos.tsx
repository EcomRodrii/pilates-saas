'use client';

// Buzón de documentos (Community & Messaging OS, P2) — sección "Documentos"
// de la ficha de la clienta, lado STAFF. El backend (esquema/RLS/rutas
// /api/documentos-socio) ya está en producción; esto es puro consumo, mismo
// patrón self-contained que FichaPlazaFija/FichaRecuperaciones (fetch propio,
// no viene en el snapshot global de studio-context).
//
// Flujo de subida en DOS pasos (ver comentario de app/api/documentos-socio):
// el archivo sube DIRECTO a Storage con la sesión del staff
// (subirDocumentoSocioArchivo), y solo entonces se crea la fila de metadatos.

import { useCallback, useEffect, useId, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FileText, Plus, Trash2, AlertTriangle, RotateCcw } from 'lucide-react';
import { listarDocumentosSocio, crearDocumentoSocio, borrarDocumentoSocio } from '@/lib/api-client';
import { subirDocumentoSocioArchivo } from '@/lib/documentos-socio-storage';
import type { RowDocumentosSocio } from '@/lib/db-types';

const CATEGORIAS: { v: RowDocumentosSocio['categoria']; l: string }[] = [
  { v: 'PLAN', l: 'Plan' },
  { v: 'FACTURA', l: 'Factura' },
  { v: 'CONTRATO', l: 'Contrato' },
  { v: 'OTRO', l: 'Otro' },
];
const CATEGORIA_LABEL = new Map(CATEGORIAS.map(c => [c.v, c.l]));
const CATEGORIA_ESTILO: Record<RowDocumentosSocio['categoria'], { bg: string; text: string }> = {
  PLAN: { bg: 'color-mix(in srgb, var(--info) 12%, var(--card))', text: 'var(--info)' },
  FACTURA: { bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)' },
  CONTRATO: { bg: '#FFF2F7', text: 'var(--brand)' },
  OTRO: { bg: 'var(--muted)', text: 'var(--muted-foreground)' },
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

type FormSubida = {
  titulo: string;
  categoria: RowDocumentosSocio['categoria'];
  caducaEn: string;
  archivo: File | null;
};

function formVacio(): FormSubida {
  return { titulo: '', categoria: 'OTRO', caducaEn: '', archivo: null };
}

export function FichaDocumentos({ socioId, onToast }: { socioId: string; onToast: (mensaje: string) => void }) {
  const { studio } = useStudio();
  const uid = useId();

  const [documentos, setDocumentos] = useState<RowDocumentosSocio[] | null>(null);
  const [error, setError] = useState(false);

  // `Date.now()` es impuro (regla de pureza de React Compiler) — no se puede
  // llamar en render. Mismo patrón que `mis-reservas-lista.tsx`: placeholder
  // fijo al render inicial, valor real fijado en un efecto tras montar.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: Date.now() no puede llamarse en render.
    setNowMs(Date.now());
  }, []);

  const cargar = useCallback(async () => {
    setError(false);
    const data = await listarDocumentosSocio(socioId);
    if (data === null) { setError(true); return; }
    setDocumentos(data);
  }, [socioId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial, misma forma que FichaPlazaFija/FichaRecuperaciones.
    setDocumentos(null);
    setError(false);
    void cargar();
  }, [cargar]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [f, setF] = useState<FormSubida>(formVacio());
  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<RowDocumentosSocio | null>(null);
  const [borrando, setBorrando] = useState(false);

  function abrir() {
    setF(formVacio());
    setErrorSubida(null);
    setDialogOpen(true);
  }

  const puedeGuardar = !!f.titulo.trim() && !!f.archivo && !subiendo;

  async function guardar() {
    if (!puedeGuardar || !f.archivo || !studio?.id) return;
    setSubiendo(true);
    setErrorSubida(null);
    const subida = await subirDocumentoSocioArchivo(studio.id, f.archivo);
    if ('error' in subida) { setSubiendo(false); setErrorSubida(subida.error); return; }
    const res = await crearDocumentoSocio({
      socioId,
      categoria: f.categoria,
      titulo: f.titulo.trim(),
      path: subida.path,
      caducaEn: f.caducaEn || null,
    });
    setSubiendo(false);
    if ('error' in res) { setErrorSubida(res.error); return; }
    setDialogOpen(false);
    setDocumentos(prev => [res.documento, ...(prev ?? [])]);
  }

  async function confirmarBorrado() {
    if (!aBorrar) return;
    setBorrando(true);
    const res = await borrarDocumentoSocio(aBorrar.id);
    setBorrando(false);
    if (!res.ok) { onToast(res.error); return; }
    setDocumentos(prev => (prev ?? []).filter(d => d.id !== aBorrar.id));
    setABorrar(null);
  }

  return (
    <div className="border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">Documentos</p>
          <p className="text-xs text-muted-foreground">Plan, facturas, contratos u otros archivos compartidos con esta socia.</p>
        </div>
        <button
          onClick={abrir}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors shrink-0"
        >
          <Plus size={14} /> Subir documento
        </button>
      </div>

      {error ? (
        <div className="py-6 text-center">
          <AlertTriangle size={18} className="mx-auto text-destructive mb-2" />
          <p className="text-xs font-semibold text-muted-foreground">No se han podido cargar los documentos.</p>
          <button
            onClick={() => void cargar()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand-secondary"
          >
            <RotateCcw size={12} /> Reintentar
          </button>
        </div>
      ) : documentos === null ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : documentos.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Todavía no hay documentos compartidos con esta socia.</p>
      ) : (
        <div className="space-y-2">
          {documentos.map(d => {
            const estilo = CATEGORIA_ESTILO[d.categoria];
            const caducado = d.caduca_en ? new Date(d.caduca_en).getTime() < nowMs : false;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 flex items-start gap-2.5">
                  <FileText size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{d.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fechaCorta(d.creado_en)}
                      {d.caduca_en ? (
                        <span style={{ color: caducado ? 'var(--destructive)' : undefined }}>
                          {' · '}{caducado ? 'Caducado' : 'Caduca'} {fechaCorta(d.caduca_en)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: estilo.bg, color: estilo.text }}>
                    {CATEGORIA_LABEL.get(d.categoria)}
                  </span>
                  <button
                    onClick={() => setABorrar(d)}
                    title="Borrar documento"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !subiendo && setDialogOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Subir documento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label htmlFor={`${uid}-titulo`} className={labelCls}>Título</label>
              <input
                id={`${uid}-titulo`}
                className={inputCls}
                value={f.titulo}
                maxLength={200}
                onChange={e => setF(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ej: Contrato firmado 2026"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-cat`} className={labelCls}>Categoría</label>
                <select
                  id={`${uid}-cat`}
                  className={inputCls}
                  value={f.categoria}
                  onChange={e => setF(p => ({ ...p, categoria: e.target.value as RowDocumentosSocio['categoria'] }))}
                >
                  {CATEGORIAS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-caduca`} className={labelCls}>Caduca el (opcional)</label>
                <input
                  id={`${uid}-caduca`}
                  type="date"
                  className={inputCls}
                  value={f.caducaEn}
                  onChange={e => setF(p => ({ ...p, caducaEn: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-archivo`} className={labelCls}>Archivo (PDF, PNG o JPG · máx. 10 MB)</label>
              <input
                id={`${uid}-archivo`}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className={inputCls}
                onChange={e => setF(p => ({ ...p, archivo: e.target.files?.[0] ?? null }))}
              />
            </div>
            {errorSubida && <p className="text-xs font-medium text-destructive">{errorSubida}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setDialogOpen(false)} disabled={subiendo} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
              Cancelar
            </button>
            <button
              disabled={!puedeGuardar}
              onClick={guardar}
              className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {subiendo ? 'Subiendo…' : 'Subir documento'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={o => { if (!o) setABorrar(null); }}
        titulo={aBorrar ? `¿Borrar "${aBorrar.titulo}"?` : ''}
        descripcion="La socia dejará de poder verlo o descargarlo en su portal."
        textoConfirmar={borrando ? 'Borrando…' : 'Borrar'}
        destructivo
        onConfirm={() => void confirmarBorrado()}
      />
    </div>
  );
}
