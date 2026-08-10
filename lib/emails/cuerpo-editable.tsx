import { Markdown, Section } from '@react-email/components';
import { EmailLayout, EmailButton, EmailInfoRow } from '@/lib/emails/layout';
import { sanearMarkdown } from '@/lib/emails/sanear-markdown';

// Lo que la propietaria ha personalizado de una plantilla. Todo opcional:
// ausente = se mantiene lo de siempre. Es el reflejo en TypeScript de las
// columnas nullable de plantillas_email (migr 20260811090000).
export interface PersonalizacionPlantilla {
  cuerpo?: string;
  botonTexto?: string;
  colorCabecera?: string;
  colorBoton?: string;
  logoUrl?: string;
  pie?: string;
  fuente?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuerpo escrito por la propietaria.
//
// Hasta ahora solo podía cambiar el asunto y el párrafo de introducción; el
// resto del correo —la tarjeta de datos, el botón, el orden— venía fijo. Aquí
// escribe el cuerpo entero en Markdown y coloca dos piezas donde quiera:
//
//   {datos}  → la tarjeta de fecha/hora/sala/instructora (o concepto/importe).
//   {boton}  → la llamada a la acción, con su enlace real.
//
// Que sean TOKENS y no dos casillas de "mostrar sí/no" es lo que hace que esto
// sea de verdad "a su gusto": puede poner los datos arriba del todo, el botón
// en medio, o no poner ninguno de los dos. Y reutiliza el mecanismo de
// variables que ya existía ({nombre}, {estudio}, {clase}), así que no hay un
// concepto nuevo que aprender.
//
// El Markdown pasa SIEMPRE por sanearMarkdown: <Markdown> de react-email no
// filtra nada y deja pasar HTML crudo y enlaces javascript: (comprobado).
// ─────────────────────────────────────────────────────────────────────────────

export interface FilaDato {
  label: string;
  value: string;
  tachado?: boolean;
}

// Markdown que se pinta con el mismo aire que el resto del correo. Sin esto,
// <Markdown> mete sus propios valores por defecto y los enlaces salen en el
// azul de Bootstrap (#007bff), que no se parece a nada del producto.
const ESTILOS_MARKDOWN = {
  p: { color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 14px' },
  li: { color: '#374151', fontSize: '15px', lineHeight: '1.6', margin: '0 0 6px' },
  h1: { color: '#1A1A1A', fontSize: '20px', fontWeight: '700', margin: '18px 0 10px' },
  h2: { color: '#1A1A1A', fontSize: '17px', fontWeight: '700', margin: '18px 0 10px' },
  h3: { color: '#1A1A1A', fontSize: '15px', fontWeight: '700', margin: '16px 0 8px' },
  bold: { fontWeight: '700' },
  link: { color: '#343825', textDecoration: 'underline' },
  image: { maxWidth: '100%' },
  blockQuote: { borderLeft: '3px solid #E5E1DA', margin: '0 0 14px', padding: '2px 0 2px 14px', color: '#63635D' },
  codeInline: { backgroundColor: '#F1F2EA', borderRadius: '4px', padding: '1px 5px', fontSize: '14px' },
};

// El token va en su propia línea. Se parte con captura para saber CUÁL salió y
// en qué orden: la propietaria puede ponerlos al revés, o repetir uno, o no
// poner ninguno.
const TOKENS = /^[ \t]*\{(datos|boton)\}[ \t]*$/gim;

/**
 * Correo completo cuando el estudio ha escrito su propio cuerpo. Las seis
 * plantillas editables desvían aquí en su primera línea, así que su camino por
 * defecto se queda intacto y sin riesgo de regresión: o hay `cuerpo` y manda
 * esto, o no lo hay y no cambia nada.
 */
export function PlantillaEditableEmail({
  estudioNombre, logoUrl, colorPrimario, personalizacion, filas, boton, preview,
}: {
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  personalizacion: PersonalizacionPlantilla & { cuerpo: string };
  filas: FilaDato[];
  boton?: { href: string; texto: string };
  // Texto de bandeja. El asunto se resuelve aparte (es una columna propia y lo
  // necesita el emisor, no la plantilla).
  preview?: string;
}) {
  const p = personalizacion;
  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={p.logoUrl ?? logoUrl}
      colorPrimario={colorPrimario}
      headerColor={p.colorCabecera}
      // Sin título fijo: lo pone ella con un `# Título` en el Markdown.
      titulo=""
      preview={preview}
      fuente={p.fuente}
      pie={p.pie}
    >
      <CuerpoEditable
        cuerpo={p.cuerpo}
        filas={filas}
        boton={boton && { href: boton.href, texto: p.botonTexto || boton.texto }}
        colorBoton={p.colorBoton ?? colorPrimario}
      />
    </EmailLayout>
  );
}

export function CuerpoEditable({
  cuerpo,
  filas,
  boton,
  colorBoton,
}: {
  cuerpo: string;
  // Los datos concretos de ESTE correo. Cada plantilla pasa los suyos: una
  // clase manda fecha/hora/sala/instructora, un impago manda concepto/importe.
  filas: FilaDato[];
  // Ausente = la plantilla no tiene adónde enlazar en este envío (p.ej. una
  // bienvenida sin magic link). Entonces {boton} no pinta nada, igual que hoy.
  boton?: { href: string; texto: string };
  colorBoton?: string | null;
}) {
  const trozos = sanearMarkdown(cuerpo).split(TOKENS);

  return (
    <>
      {trozos.map((trozo, i) => {
        // String.split con un grupo de captura intercala los grupos: los
        // índices impares son el token capturado, los pares el texto de en medio.
        const esToken = i % 2 === 1;
        const clave = `${i}-${trozo}`;

        if (!esToken) {
          return trozo.trim() === ''
            ? null
            : <Markdown key={clave} markdownCustomStyles={ESTILOS_MARKDOWN}>{trozo}</Markdown>;
        }

        if (trozo === 'datos') {
          if (filas.length === 0) return null;
          return (
            <Section key={clave} style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '20px 24px', margin: '0 0 20px' }}>
              {filas.map((f) => <EmailInfoRow key={f.label} label={f.label} value={f.value} tachado={f.tachado} />)}
            </Section>
          );
        }

        // {boton}
        if (!boton) return null;
        return (
          <Section key={clave} style={{ margin: '0 0 20px' }}>
            <EmailButton href={boton.href} colorPrimario={colorBoton}>{boton.texto}</EmailButton>
          </Section>
        );
      })}
    </>
  );
}
