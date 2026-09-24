/**
 * The order a challenge's options are shown in. Authors write the right answer
 * near the top — all fourteen of the first challenges put it first or second,
 * never third or fourth — so file order is a tell a reader learns in three
 * questions. The order is derived from the id, so the server and the browser
 * agree and the same question always looks the same; answers are still stored
 * by the option's position in the file, so a reader's past answers keep their
 * meaning.
 */
export function displayOrder(id: string, count: number): number[] {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619) >>> 0;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
