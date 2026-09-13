'use client';

import { useState } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { copiarAlPortapapeles } from '@/lib/utils';
import { enlaceInvitacion, textoInvitacion } from '@/lib/student/referido';
import { Icono } from '@/components/student/ui/Icono';

// Invitar a una amiga.
//
// ⚠️ NO PROMETE UN PREMIO. La regla que da créditos a quien invita
// (`REFERIDO_AMIGO`) es OPCIONAL por estudio y se paga cuando la invitada
// ASISTE a su primera clase, no al registrarse. Decir aquí «ganáis las dos»
// sería vender algo que puede no existir en este estudio y que, aun
// existiendo, no depende de quien comparte el enlace.
//
// Lo que sí es cierto y es lo que se dice: comparte el estudio con alguien.
export function InvitarAmiga({ slug, socioId, nombreEstudio }: {
  slug: string; socioId: string; nombreEstudio: string;
}) {
  const [abierta, setAbierta] = useState(false);
  // `null` = todavía no lo ha intentado.
  const [copiado, setCopiado] = useState<boolean | null>(null);

  // El origen se lee del navegador: en local, en preview y en producción el
  // enlace tiene que ser el de DONDE está, no uno fijo.
  const enlace = typeof window !== 'undefined'
    ? enlaceInvitacion(window.location.origin, slug, socioId)
    : '';

  const copiar = async () => {
    // ⚠️ Se mira el RESULTADO. `copiarAlPortapapeles` devuelve si de verdad
    // escribió, y decir «Copiado» sin comprobarlo ya salió mal en este repo:
    // tres pantallas lo afirmaban con el portapapeles vacío.
    setCopiado(await copiarAlPortapapeles(textoInvitacion(nombreEstudio, enlace)));
  };

  return (
    <>
      <button
        type="button"
        className="card card--tap card--pad row row--between tap"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => { setCopiado(null); setAbierta(true); }}
        data-testid="abrir-invitar"
      >
        <span className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="t-card-title">Invita a una amiga</span>
          <span className="t-meta">Comparte {nombreEstudio} con quien quieras</span>
        </span>
        <Icono nombre="chevron-derecha" tamano={18} stroke="var(--subtle-foreground)" className="no-shrink" />
      </button>

      <Sheet open={abierta} onClose={() => setAbierta(false)} label="Invitar a una amiga">
        <div className="stack" style={{ ['--gap' as string]: 'var(--s-3)', paddingBottom: 'var(--s-4)' }}>
          <h2 className="t-title">Invita a una amiga</h2>
          <p className="t-small t-dim">
            Este enlace la lleva a darse de alta en {nombreEstudio}. Cuando se apunte,
            quedará registrado que la trajiste tú.
          </p>

          <p
            className="t-code"
            data-testid="enlace-invitacion"
            style={{
              margin: 0, padding: 'var(--s-3)', borderRadius: 'var(--radius-sm)',
              background: 'var(--muted)', color: 'var(--muted-foreground)',
              fontSize: 'var(--t-meta)', lineHeight: 1.5, wordBreak: 'break-all',
            }}
          >
            {enlace}
          </p>

          <Button full onClick={() => void copiar()}>Copiar la invitación</Button>

          {copiado !== null && (
            <p
              role="status"
              data-testid="copiado"
              className={'note ' + (copiado ? 'note--ok' : 'note--warn')}
            >
              {copiado
                ? 'Copiado. Ya puedes pegarlo donde quieras.'
                : 'No hemos podido copiarlo. Selecciona el enlace de arriba y cópialo a mano.'}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
