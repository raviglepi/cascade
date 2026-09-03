import {isTokenInstance as isTokenInstanceInternal} from "./token.ts";

/** @since 0.1.0 */

export {
  /** @since 0.1.0 */
  Cascade,
} from "./cascade.ts";
export type {
  /** @since 0.1.0 */
  CascadeRuntime,
  /** @since 0.1.0 */
  MountedRoots,
} from "./graph.ts";
export type {
  /** @since 0.1.0 */
  CascadeEffect,
  /** @since 0.1.0 */
  WriteAddress,
  /** @since 0.1.0 */
  WriteSlot,
  /** @since 0.1.0 */
  WritesOf,
} from "./operation.ts";
export {
  /** @since 0.1.0 */
  Rule,
  /** @since 0.1.0 */
  RuleBundle,
  /** @since 0.1.0 */
  Rules,
} from "./rules.ts";
export type {
  /** @since 0.1.0 */
  RuleDefinition,
  /** @since 0.1.0 */
  RuleFailure,
} from "./rules.ts";
export {
  /** @since 0.1.0 */
  Alias,
  /** @since 0.1.0 */
  Not,
  /** @since 0.1.0 */
  Token,
} from "./token.ts";
/** @internal */
export const isTokenInstance = isTokenInstanceInternal;
export type {
  /** @since 0.1.0 */
  DefinitionName,
  /** @since 0.1.0 */
  DefinitionOf,
  /** @since 0.1.0 */
  LiveToken,
  /** @since 0.1.0 */
  NegativeOf,
  /** @since 0.1.0 */
  NotTerm,
  /** @since 0.1.0 */
  PositiveOf,
  /** @since 0.1.0 */
  TokenAlias,
  /** @since 0.1.0 */
  TokenDefinition,
  /** @since 0.1.0 */
  TokenDefinitionRef,
  /** @since 0.1.0 */
  TokenInstance,
  /** @since 0.1.0 */
  TokenInstanceRef,
  /** @since 0.1.0 */
  TokenRoot,
  /** @since 0.1.0 */
  TokenTerm,
  /** @since 0.1.0 */
  TokenValue,
  /** @since 0.1.0 */
  ValueOf,
} from "./token.ts";
