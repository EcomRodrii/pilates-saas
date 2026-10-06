'use client';

import type { ReactNode } from 'react';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { trocearTexto } from '@/lib/asistente/estado-ui';
import { NombrePersona } from './referencias-ui';

// El texto de una respuesta, con un markdown SENCILLO (párrafos, listas con
// guion y **negrita**: el prompt pide texto corrido, pero si el modelo pone una
// negrita no se ve el asterisco), cada `[ALUMNA_3]` como su nombre (enlazado)
// y cada importe con CifraPrivada. Nada de HTML del modelo: todo son nodos de
// React construidos aquí.

function enLinea(texto: string, clave: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).flatMap((parte, i) => {
    const negrita = /^\*\*[^*]+\*\*$/.test(parte);
    const contenido = trocearTexto(negrita ? parte.slice(2, -2) : parte).map((t, j) => {
      const k = `${clave}-${i}-${j}`;
      if (t.tipo === 'ref') return <NombrePersona key={k} referencia={t.ref} enTexto />;
      if (t.tipo === 'euros') return <CifraPrivada key={k} inline className="font-medium tabular-nums">{t.texto}</CifraPrivada>;
      return <span key={k}>{t.texto}</span>;
    });
    return negrita ? [<strong key={`${clave}-${i}`} className="font-semibold">{contenido}</strong>] : contenido;
  });
}

export function TextoConReferencias({ texto, cursor = false }: { texto: string; cursor?: boolean }) {
  const bloques = texto.split(/\n{2,}/).filter(b => b.trim());
  const caret = cursor ? <span key="cursor" aria-hidden="true" className="asistente-cursor ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded-full bg-foreground/70" /> : null;
  if (!bloques.length) return caret;
  return (
    <>
      {bloques.map((b, i) => {
        const ultimo = i === bloques.length - 1;
        const lineas = b.split('\n');
        if (lineas.every(l => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {lineas.map((l, j) => <li key={j}>{enLinea(l.replace(/^\s*[-•]\s+/, ''), `${i}-${j}`)}{ultimo && j === lineas.length - 1 && caret}</li>)}
            </ul>
          );
        }
        return (
          <p key={i} className="[&:not(:first-child)]:mt-3">
            {lineas.flatMap((l, j) => (j ? [<br key={`br-${j}`} />, ...enLinea(l, `${i}-${j}`)] : enLinea(l, `${i}-${j}`)))}
            {ultimo && caret}
          </p>
        );
      })}
    </>
  );
}

/** El texto tal cual lo leería ella, con los nombres puestos: para copiar. */
export function textoPlano(texto: string, nombres: Record<string, { nombre: string }>): string {
  return texto.replace(/\[([A-Z]+_\d+)\]/g, (m, ref: string) => nombres[ref]?.nombre ?? m).replace(/\*\*([^*]+)\*\*/g, '$1');
}
