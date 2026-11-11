import { logosParaLaMaqueta } from '@/components/landing-figma/logos-servidor';
import { Beneficios, Cabecera, Confianza, Contacto, Funciones, Heroe, LlamadaFinal, Pie, Preguntas, Precios } from '@/components/landing-figma/secciones';
import { AVISO } from '@/components/landing-figma/contenido';
import '@/components/landing-figma/figma.css';

// Maqueta del diseño de Figma, de arriba abajo. Independiente de la home: no usa sus secciones ni sus estilos (todo cuelga de
// `.lf`). Ver el layout: noindex y sin enlazar.
export default async function MaquetaFigmaPage() {
  const logos = await logosParaLaMaqueta();
  return (
    <>
      <Cabecera />
      <main>
        <Heroe />
        <Confianza logos={logos} />
        <Funciones />
        <Beneficios />
        <LlamadaFinal />
        <Precios />
        <Preguntas />
        <Contacto />
      </main>
      <Pie />
      <p className="lf-aviso" role="note">{AVISO}</p>
    </>
  );
}
