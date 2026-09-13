'use client';
import { Sheet } from './Sheet';
import { Button } from './Button';
// `deshabilitado`: el botón de confirmar no se puede pulsar hasta que se cumple
// algo que pide el contenido (p. ej. escribir una frase de confirmación).
export function ConfirmationDialog({ open, onClose, titulo, cuerpo, confirmar, cancelar = 'Volver', tono = 'primary', loading, deshabilitado, onConfirm, children }: { open: boolean; onClose: () => void; titulo: string; cuerpo?: string; confirmar: string; cancelar?: string; tono?: 'primary' | 'danger'; loading?: boolean; deshabilitado?: boolean; onConfirm: () => void; children?: React.ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} label={titulo}>
      <h3 className="t-h2" style={{ textAlign: 'center' }}>{titulo}</h3>
      {cuerpo && <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{cuerpo}</p>}
      {children}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <Button variant={tono === 'danger' ? 'danger' : 'primary'} full loading={loading} disabled={deshabilitado} onClick={onConfirm} style={tono === 'danger' ? { height: 48, background: 'var(--destructive)', color: '#fff', fontSize: 'var(--t-body)' } : undefined}>{confirmar}</Button>
        <Button variant="ghost" full onClick={onClose} disabled={loading}>{cancelar}</Button>
      </div>
    </Sheet>
  );
}
