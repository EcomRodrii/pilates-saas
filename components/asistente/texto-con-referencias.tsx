'use client';

import { CifraPrivada } from '@/components/ui/cifra-privada';
import { trocearTexto } from '@/lib/asistente/estado-ui';
import { NombrePersona } from './referencias-ui';

/** El texto de la respuesta: cada `[ALUMNA_3]` como su nombre (enlazado) y cada importe con CifraPrivada. */
export function TextoConReferencias({ texto }: { texto: string }) {
  return (
    <>
      {trocearTexto(texto).map((t, i) => {
        if (t.tipo === 'ref') return <NombrePersona key={i} referencia={t.ref} enTexto />;
        if (t.tipo === 'euros') return <CifraPrivada key={i} inline className="font-medium tabular-nums">{t.texto}</CifraPrivada>;
        return <span key={i}>{t.texto}</span>;
      })}
    </>
  );
}
