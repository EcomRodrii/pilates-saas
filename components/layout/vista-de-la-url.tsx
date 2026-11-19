'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

// Una pantalla con vistas (pestañas) que el menú a sangre enlaza con `?tab=…` (lib/nav-submenus.ts): al entrar ya la
// leían de `window.location`, pero pulsar OTRA vista del menú estando ya en la pantalla no la remonta, así que no se
// enteraba. Esto avisa cada vez que el parámetro cambia: con su valor, o con `null` cuando se vuelve a la vista de por
// defecto (el enlace sin parámetro). No avisa en el primer render sin parámetro, para no pisar lo que la pantalla ya
// decidió por su cuenta al abrirse. Va dentro de un `<Suspense fallback={null}>`: lee `useSearchParams`.
export function VistaDeLaUrl({ nombre, onValor }: { nombre: string; onValor: (valor: string | null) => void }) {
  const valor = useSearchParams().get(nombre);
  const anterior = useRef<string | null | undefined>(undefined);
  const aviso = useRef(onValor);
  useEffect(() => { aviso.current = onValor; });
  useEffect(() => {
    const prev = anterior.current;
    anterior.current = valor;
    if (valor !== null || (prev !== undefined && prev !== null)) aviso.current(valor);
  }, [valor]);
  return null;
}

/**
 * La otra mitad: cuando la pantalla cambia de vista POR SU CUENTA (una pestaña pulsada dentro de ella), la URL la sigue, y el
 * menú marca la vista que de verdad se ve. La vista de por defecto quita el parámetro. Se salta la primera pasada: al abrirse,
 * la pantalla aún puede estar leyendo el parámetro de la URL, y borrarlo antes la dejaría sin su vista.
 */
export function useUrlSigueALaVista(nombre: string, valor: string, defecto: string) {
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const url = new URL(window.location.href);
    if (valor === defecto) url.searchParams.delete(nombre);
    else url.searchParams.set(nombre, valor);
    const destino = url.pathname + url.search;
    if (destino !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', destino);
  }, [nombre, valor, defecto]);
}
