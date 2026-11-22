'use client';

import { useState } from 'react';
import { copiarAlPortapapeles } from '@/lib/utils';
import { diaLargo, textoDelPremio, type PremioResena } from '@/lib/valoraciones/premio';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';

// Lo que sale DESPUÉS de valorar una clase: el enlace a la página de reseñas del estudio
// (si le toca) y, aparte, un agradecimiento del estudio (si lo ofrece).
//
// Cómo lo hacen los grandes: el enlace es la acción PRINCIPAL y va primero, en un toque y
// con un botón grande; lo demás, quieto, debajo. Y solo le sale a quien ya conoce el
// estudio (3 clases asistidas, una vez cada 180 días), decidido en el servidor.
//
// ⚠️ Dos bloques que NO se mencionan entre sí, y es a propósito: el agradecimiento es por
// valorar EN TENTARE y se da con cualquier nota; el enlace se ofrece sin hablar de él.
// Premiar o condicionar la reseña pública no se puede comprobar, Google lo prohíbe y la
// normativa de consumo exige declararlo (lib/valoraciones/premio.ts).
//
// Dónde se canjea, dicho tal cual es: al comprar un bono o un plan (la hoja de compra de
// esta app y /reservar) y en la Caja. El pago de una clase suelta no tiene campo de
// código: no se promete.

export function PremioValoracion({ premio, enlace }: { premio?: PremioResena; enlace?: string }) {
  if (!premio && !enlace) return null;
  return (
    <div data-testid="premio-valoracion" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      {enlace && <BloqueEnlace enlace={enlace} />}
      {premio && <BloquePremio premio={premio} />}
    </div>
  );
}

function BloquePremio({ premio }: { premio: PremioResena }) {
  const { toast } = useToast();
  const [copiado, setCopiado] = useState(false);

  if (premio.canjeado) {
    return <p className="t-meta" data-testid="premio-canjeado">Ya has usado tu premio por valorar. ¡Gracias!</p>;
  }
  if (!premio.vigente) {
    return <p className="t-meta" data-testid="premio-caducado">Tu premio por valorar caducó{premio.expira ? ` el ${diaLargo(premio.expira)}` : ''}.</p>;
  }

  const copiar = async () => {
    // Solo dice «Copiado» si de verdad se ha escrito (Safari rechaza sin gesto o sin permiso).
    if (await copiarAlPortapapeles(premio.codigo)) { setCopiado(true); toast('Código copiado'); }
    else toast('No se ha podido copiar. Anótalo a mano.', { variant: 'error' });
  };

  return (
    <div className="card" style={{ padding: 'var(--s-3) var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }} data-testid="premio-codigo">
      <p className="t-label">Gracias por valorar</p>
      <p className="t-card-title">Te regalamos {textoDelPremio(premio)}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-2)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--muted)' }}>
        <code style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.04em' }} aria-label={`Tu código es ${premio.codigo.split('').join(' ')}`}>{premio.codigo}</code>
        <Button variant="secondary" size="sm" onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar'}</Button>
      </div>
      <p className="t-meta">
        Úsalo al comprar un bono o un plan en esta app, o díselo a recepción.{premio.expira ? ` Vale hasta el ${diaLargo(premio.expira)}.` : ''}
      </p>
    </div>
  );
}

function BloqueEnlace({ enlace }: { enlace: string }) {
  return (
    <div className="card" style={{ padding: 'var(--s-3) var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }} data-testid="enlace-resenas">
      <p className="t-card-title">¿Te ha gustado? Cuéntalo en público</p>
      <p className="t-meta">Son 30 segundos y ayuda a que más gente encuentre el estudio.</p>
      <a className="btn btn--primary btn--full" href={enlace} target="_blank" rel="noopener noreferrer">Dejar mi reseña</a>
    </div>
  );
}
