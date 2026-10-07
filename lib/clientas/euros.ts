// «12 €» o «12,50 €»: enteros sin decimales y coma decimal. Una sola copia para los textos de clientas y de
// cuotas (había tres idénticas). Las pantallas de la alumna tienen su propio formato en lib/student/formato.ts.
export const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
