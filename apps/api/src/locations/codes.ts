// Orden del árbol a partir de los códigos de ubicación ("6-1-10"): segmento
// por segmento como números, y un padre antes que sus hijos. Así 1-1-2 va
// antes que 1-1-10, y todo lo que empieza con 1- antes que 2.
export function compareCodes(a: string, b: string): number {
  const x = a.split("-").map(Number);
  const y = b.split("-").map(Number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return x.length - y.length;
}
