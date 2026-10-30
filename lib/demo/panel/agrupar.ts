// De los pasos de una demo a los pasos de la guía sobre el panel REAL. Un escenario cuenta una historia en varios pasos
// («reserva», «avisa», «último día»…) pero muchos caen en la MISMA pantalla del panel (la ficha de la alumna, con otros
// números). Enseñar la misma pantalla seis veces seguidas es repetirse: aquí cada pantalla sale UNA vez, con el resultado a la
// vista (los datos del último paso que cae en ella) y la historia resumida en la barra.
import type { PantallaPanel, PasoDemo } from '../modelo.ts';

export interface PasoGuiaAgrupado { titulo: string; proposito: string; pantalla?: PantallaPanel; historia?: string[] }

const rutaDe = (p: PantallaPanel) => p.ruta.split('?')[0];
const mismosAjustes = (a: PantallaPanel, b: PantallaPanel) => JSON.stringify(a.reglas ?? null) === JSON.stringify(b.reglas ?? null);

export function agruparPasosParaPanel(pasos: PasoDemo[]): PasoGuiaAgrupado[] {
  const grupos: PasoGuiaAgrupado[] = [];
  // Un paso sin pantalla del panel (un aparte) no tiene qué enseñar: se queda en el resumen en texto.
  const conPantalla = pasos.filter((p) => p.pantalla);
  for (const paso of conPantalla.length ? conPantalla : pasos) {
    const p = paso.pantalla;
    const titular = p?.titular ?? paso.titulo;
    const ultimo = grupos[grupos.length - 1];
    if (!p || !ultimo?.pantalla) { grupos.push({ titulo: paso.titulo, proposito: paso.proposito, pantalla: p, historia: [titular] }); continue; }
    if (rutaDe(p) === rutaDe(ultimo.pantalla)) {
      // La misma pantalla justo después: sigue la historia y se ve cómo acaba (los datos de este paso).
      grupos[grupos.length - 1] = { titulo: paso.titulo, proposito: paso.proposito, pantalla: { ...p, foco: p.foco ?? ultimo.pantalla.foco, pistas: p.pistas ?? ultimo.pantalla.pistas }, historia: [...(ultimo.historia ?? []), titular] };
    } else if (grupos.some((g) => g.pantalla && rutaDe(g.pantalla) === rutaDe(p) && mismosAjustes(g.pantalla, p))) {
      // Vuelve a una pantalla ya enseñada con los mismos ajustes: no se repite; su conclusión se cuenta donde se está.
      grupos[grupos.length - 1] = {
        ...ultimo, titulo: paso.titulo, proposito: paso.proposito,
        pantalla: { ...ultimo.pantalla, titular: p.titular, detalle: p.detalle }, historia: [...(ultimo.historia ?? []), titular],
      };
    } else {
      grupos.push({ titulo: paso.titulo, proposito: paso.proposito, pantalla: p, historia: [titular] });
    }
  }
  return grupos.map((g) => ({ ...g, historia: g.historia && g.historia.length > 1 ? [...new Set(g.historia)] : undefined }));
}
