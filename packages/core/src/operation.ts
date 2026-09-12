/** @since 0.1.0 */

import type {Effect} from "effect";

/** @since 0.1.0 */
export type WriteSlot =
  | {readonly kind: "value"}
  | {readonly kind: "relations"}
  | {readonly definition: string; readonly kind: "relation"};

/** @since 0.1.0 */
export interface WriteAddress<
  Root extends string = string,
  Path extends readonly string[] = readonly string[],
  Slot extends WriteSlot = WriteSlot,
> {
  readonly path: Path;
  readonly root: Root;
  readonly slot: Slot;
}

/** @since 0.1.0 */
export const OperationWritesId: unique symbol = Symbol("cascade.operation.writes");

/** @since 0.1.0 */
export interface CascadeEffect<A, Writes extends WriteAddress = never> extends Effect.Effect<
  A,
  never
> {
  readonly [OperationWritesId]: Writes;
  [Symbol.iterator](): Effect.EffectIterator<CascadeEffect<A, Writes>>;
}

/** @since 0.1.0 */
export type WritesOf<Operation> = Operation extends {
  readonly [OperationWritesId]: infer Writes extends WriteAddress;
}
  ? Writes
  : never;
