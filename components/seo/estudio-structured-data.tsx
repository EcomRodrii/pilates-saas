import { estudioJsonLd, type EstudioParaJsonLd } from '@/lib/seo/estudio-jsonld';

// El `<script type="application/ld+json">` del negocio local. Toda la decisión
// de QUÉ se emite vive en la función pura (con tests); aquí solo se pinta.
//
// `.replace(/</g, '\\u003c')` como el resto del JSON-LD del repo: escapa un
// `</script>` que viniera dentro de un dato del estudio —el nombre y la
// descripción los escribe la propietaria— y que cerraría la etiqueta antes de
// tiempo. `dangerouslySetInnerHTML` es la forma correcta de meter JSON-LD, pero
// ese escape es lo que la hace segura.
export function EstudioStructuredData({ estudio }: { estudio: EstudioParaJsonLd }) {
  const ld = estudioJsonLd(estudio);
  if (!ld) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }}
    />
  );
}
