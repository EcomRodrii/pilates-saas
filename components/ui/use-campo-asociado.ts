'use client';

import { useId, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';

// Asocia la etiqueta de un componente envoltorio con el control que recibe por
// children (WCAG 1.3.1 / 4.1.2).
//
// Estos envoltorios (FormField, Field, FF…) renderizaban <label>{label}</label>
// seguido de {children}: la etiqueta no apuntaba a nada, así que el lector de
// pantalla anunciaba el campo sin decir de qué era. Como el control llega por
// props, no se le puede poner el id desde fuera; hay que inyectárselo.
//
// Dos decisiones que evitan romper cosas:
//  · Si children NO es un único elemento (un fragmento, una lista, texto), no
//    se inyecta nada y htmlFor queda undefined. Es preferible no tener
//    asociación a que apunte a un id inexistente, que es peor: el lector
//    anuncia una relación que no existe.
//  · Si el hijo YA trae id (porque la pantalla se lo puso a mano), se respeta
//    ese y se usa para el htmlFor, en vez de pisarlo.
export function useCampoAsociado(children: ReactNode): {
  htmlFor: string | undefined;
  control: ReactNode;
} {
  const generado = useId();

  if (!isValidElement(children)) return { htmlFor: undefined, control: children };

  const hijo = children as ReactElement<{ id?: string }>;
  const idExistente = hijo.props?.id;
  if (idExistente) return { htmlFor: idExistente, control: children };

  return { htmlFor: generado, control: cloneElement(hijo, { id: generado }) };
}
