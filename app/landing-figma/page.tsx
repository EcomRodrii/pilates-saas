import { logosParaLaMaqueta } from '@/components/landing-figma/logos-servidor';
import { Cabecera } from '@/components/landing-figma/cabecera';
import { Revelar } from '@/components/landing-figma/revelar';
import { Beneficios, Confianza, Contacto, Funciones, Heroe, LlamadaFinal, Pie, Preguntas, Precios } from '@/components/landing-figma/secciones';
import { AVISO } from '@/components/landing-figma/contenido';
import '@/components/landing-figma/figma.css';

// Maqueta del diseño de Figma, de arriba abajo, con la identidad de Tentare (tokens `--w-*`, logotipo oficial) y las fotos del fundador. Independiente de la home: no usa sus secciones ni sus estilos (todo cuelga de
// `.lf`). Ver el layout: noindex y sin enlazar.
export default async function MaquetaFigmaPage() {
  const logos = await logosParaLaMaqueta();
  return (
    <>
      <Revelar />
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
