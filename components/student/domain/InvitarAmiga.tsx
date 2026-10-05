'use client';

import { useState } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { enlaceInvitacion, fraseInvitacion } from '@/lib/student/referido';
import { useCompartir } from '@/lib/student/use-compartir';
import { Icono } from '@/components/student/ui/Icono';

// Invitar a una amiga.
//
// ⚠️ El premio, SOLO si existe y con su condición real. La regla que da créditos
// a quien invita (`REFERIDO_AMIGO`) es OPCIONAL por estudio y se paga cuando la
// invitada ASISTE a su primera clase —y solo si se dio de alta con el enlace—,
// con tope al mes. Sin la regla no se promete nada; con ella, la frase sale de
// `premioPorInvitar` (lib/student/gamificacion.ts), la misma que la ficha de la
// clase, y va en la tarjeta, no en la hoja. Nunca «ganáis las dos».
//
// Lo que sí es cierto siempre es lo que se dice: comparte el estudio con alguien.
//
// Se COMPARTE con la hoja del sistema (la nativa de iOS dentro de la app, la del
// navegador si la tiene: WhatsApp, Mensajes, Mail…). Solo donde no hay hoja
// —casi todo escritorio— se copia, que es lo único que hacía antes.
export function InvitarAmiga({ slug, socioId, nombreEstudio, premio = null }: {
  slug: string; socioId: string; nombreEstudio: string;
  /** Lo que gana si el estudio premia invitar (`premioPorInvitar`); `null` = no se promete nada. */
  premio?: string | null;
}) {
  const [abierta, setAbierta] = useState(false);
  const { hayHoja, compartir, copiado, olvidar } = useCompartir();

  // El origen se lee del navegador: en local, en preview y en producción el
  // enlace tiene que ser el de DONDE está, no uno fijo.
  const enlace = typeof window !== 'undefined'
    ? enlaceInvitacion(window.location.origin, slug, socioId)
    : '';

  // ⚠️ Si toca copiar, se mira el RESULTADO (`useCompartir`): decir «Copiado»
  // sin comprobarlo ya salió mal en este repo.
  const invitar = () => compartir({ titulo: `Invitación a ${nombreEstudio}`, texto: fraseInvitacion(nombreEstudio), url: enlace });

  return (
    <>
      <button
        type="button"
        className="card card--tap card--pad row row--between tap"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={() => { olvidar(); setAbierta(true); }}
        data-testid="abrir-invitar"
      >
        <span className="stack" style={{ ['--gap' as string]: '2px' }}>
          <span className="t-card-title">Invita a una amiga</span>
          <span className="t-meta">Comparte {nombreEstudio} con quien quieras</span>
          {premio && <span className="t-meta" data-testid="premio-invitar">{premio}</span>}
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

          <Button full onClick={() => void invitar()} data-testid="compartir-invitacion">
            {hayHoja ? 'Compartir la invitación' : 'Copiar la invitación'}
          </Button>

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
