/**
 * Return `prev` when `next` holds the same data, so a polling `setState` with a freshly
 * deserialized but unchanged result does not re-render the whole app.
 */
export function keepIfUnchanged<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
