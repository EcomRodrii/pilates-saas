'use client';

import { useCallback, useState } from 'react';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { useAsync } from '@/lib/student/useAsync';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { compartirFichero } from '@/lib/nativo/puente';
import { useToast } from '@/components/student/ui/Toast';

// «Añadir a Apple Wallet», bajo el QR de acceso. OCULTO mientras el servidor no
// tenga con qué firmar (`GET /api/public/wallet-pase` → `disponible`): hoy falta
// el certificado «Pass Type ID» (docs/APP-IOS.md, «Apple Wallet»). Solo en la
// app de iOS: en un Android no hay Wallet de Apple, y en la web del iPhone
// tampoco se ha probado.
//
// ⚠️ Sin probar en un iPhone: el `.pkpass` se entrega por la hoja de compartir
// (`compartirFichero`), que en iOS debería ofrecer «Añadir a Wallet». Si no lo
// ofrece, la pieza que falta es un plugin nativo mínimo con
// `PKAddPassesViewController` (está escrito en docs/APP-IOS.md).
export function AnadirAWallet({ slug }: { slug: string }) {
  const nativa = useAppNativa();
  const { toast } = useToast();
  const [preparando, setPreparando] = useState(false);
  const comprobar = useCallback(async () => {
    try {
      const r = await fetch('/api/public/wallet-pase');
      return r.ok ? ((await r.json()) as { disponible?: boolean }).disponible === true : false;
    } catch {
      return false;
    }
  }, []);
  const { data: disponible } = useAsync(comprobar, () => false);
  if (!nativa || disponible !== true) return null;

  const anadir = async () => {
    if (preparando) return;
    setPreparando(true);
    try {
      const auth = await portalAuthHeader();
      const res = await fetch('/api/public/wallet-pase', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: string } | null;
        toast(e?.error ?? 'No hemos podido preparar tu pase.');
        return;
      }
      const r = await compartirFichero({ nombre: 'acceso.pkpass', tipo: 'application/vnd.apple.pkpass', contenido: await res.blob() });
      if ('error' in r && r.error !== 'cancelado') toast('No hemos podido abrir Wallet.');
    } finally {
      setPreparando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void anadir()}
      disabled={preparando}
      className="tap"
      data-testid="anadir-a-wallet"
      style={{ width: '100%', height: 'var(--h-control-lg)', borderRadius: 12, border: 'none', background: '#000', color: '#fff', fontSize: 'var(--t-body)', fontWeight: 700 }}
    >
      {preparando ? 'Preparando tu pase…' : 'Añadir a Apple Wallet'}
    </button>
  );
}
