/** @since 0.1.0 */

import type {Cause} from "effect";
import type {CascadeEffect, WriteAddress, WritesOf, WriteSlot} from "./operation.ts";
import type {
  DefinitionName,
  DefinitionOf,
  ExcludedBy,
  LiveToken,
  NegativeOf,
  PositiveOf,
  TokenDefinitionRef,
  TokenInstanceRef,
} from "./token.ts";

/** @since 0.1.0 */
export interface RuleFailure {
  readonly cause: Cause.Cause<never>;
  readonly rule: string;
  readonly token: LiveToken;
}

/** @since 0.1.0 */
export type RuleFailureListener = (failure: RuleFailure) => void;

/** @since 0.1.0 */
export type RuntimeRuleHandler = (
  token: LiveToken<TokenDefinitionRef, string, readonly []>,
) => Generator<CascadeEffect<void, WriteAddress>, void, never>;

/** @since 0.1.0 */
export interface RuntimeRule {
  readonly condition: TokenInstanceRef;
  readonly handler: RuntimeRuleHandler;
  readonly name: string;
}

interface ConditionSummary<
  Root extends string = string,
  Positive extends string = string,
  Negative extends string = string,
> {
  readonly negative: Negative;
  readonly positive: Positive;
  readonly root: Root;
}

/** @internal */
interface RegisteredRule<
  Condition extends ConditionSummary = ConditionSummary,
  Writes extends WriteAddress = WriteAddress,
> {
  readonly condition: Condition;
  readonly writes: Writes;
}

type Names<Definitions extends TokenDefinitionRef> = Definitions extends TokenDefinitionRef
  ? DefinitionName<Definitions>
  : never;

type ExcludedNames<Definitions extends TokenDefinitionRef> = Definitions extends TokenDefinitionRef
  ? Names<ExcludedBy<Definitions>>
  : never;

/** @since 0.1.0 */
export type ConditionOf<Condition extends TokenInstanceRef> = ConditionSummary<
  DefinitionName<DefinitionOf<Condition>>,
  Names<PositiveOf<Condition>>,
  Names<NegativeOf<Condition>> | ExcludedNames<PositiveOf<Condition>>
>;

type ConditionsDisjoint<Left extends ConditionSummary, Right extends ConditionSummary> =
  Extract<Left["root"], Right["root"]> extends never
    ? true
    : Extract<Left["positive"], Right["negative"]> extends never
      ? Extract<Right["positive"], Left["negative"]> extends never
        ? false
        : true
      : true;

type SamePath<
  Left extends readonly string[],
  Right extends readonly string[],
> = Left extends readonly [infer LeftHead, ...infer LeftTail extends readonly string[]]
  ? Right extends readonly [infer RightHead, ...infer RightTail extends readonly string[]]
    ? [LeftHead, RightHead] extends [RightHead, LeftHead]
      ? SamePath<LeftTail, RightTail>
      : false
    : false
  : Right extends readonly []
    ? true
    : false;

type SlotsOverlap<Left extends WriteSlot, Right extends WriteSlot> = Left extends {
  readonly kind: "value";
}
  ? Right extends {readonly kind: "value"}
    ? true
    : false
  : Right extends {readonly kind: "value"}
    ? false
    : Left extends {readonly kind: "relations"}
      ? true
      : Right extends {readonly kind: "relations"}
        ? true
        : Left extends {readonly definition: infer LeftName extends string}
          ? Right extends {readonly definition: infer RightName extends string}
            ? Extract<LeftName, RightName> extends never
              ? false
              : true
            : false
          : false;

type WritesOverlap<Left extends WriteAddress, Right extends WriteAddress> =
  Extract<Left["root"], Right["root"]> extends never
    ? false
    : SamePath<Left["path"], Right["path"]> extends true
      ? SlotsOverlap<Left["slot"], Right["slot"]>
      : false;

type ConflictWithEarlier<
  Earlier extends RegisteredRule,
  Condition extends ConditionSummary,
  Writes extends WriteAddress,
> =
  Earlier extends RegisteredRule<
    infer EarlierCondition extends ConditionSummary,
    infer EarlierWrites extends WriteAddress
  >
    ? ConditionsDisjoint<EarlierCondition, Condition> extends true
      ? never
      : EarlierWrites extends EarlierWrites
        ? Writes extends Writes
          ? WritesOverlap<EarlierWrites, Writes> extends true
            ? EarlierWrites
            : never
          : never
        : never
    : never;

/** @since 0.1.0 */
type RuleValidation<Earlier extends RegisteredRule, Condition extends ConditionSummary, Yielded> = [
  Yielded,
] extends [never]
  ? object
  : Yielded extends CascadeEffect<void, WriteAddress>
    ? [ConflictWithEarlier<Earlier, Condition, WritesOf<Yielded>>] extends [never]
      ? object
      : {
          readonly "Cascade rule conflict": "conditions overlap and write the same target";
          readonly write: ConflictWithEarlier<Earlier, Condition, WritesOf<Yielded>>;
        }
    : {readonly "Cascade rule error": "handlers may only yield Cascade operations"};

/** @since 0.1.0 */
export type NextRegisteredRule<
  Earlier extends RegisteredRule,
  Condition extends TokenInstanceRef,
  Yielded,
> = Earlier | RegisteredRule<ConditionOf<Condition>, WritesOf<Yielded>>;

/** @since 0.1.0 */
export interface RuleDefinition {
  readonly condition: TokenInstanceRef;
  readonly handler: RuntimeRuleHandler;
}

const ruleDefinitions = new WeakSet<object>();

/** @since 0.1.0 */
export function Rule<
  Condition extends TokenInstanceRef,
  Yielded extends CascadeEffect<void, WriteAddress>,
>(
  condition: Condition,
  handler: (
    token: LiveToken<DefinitionOf<Condition>, DefinitionName<DefinitionOf<Condition>>, readonly []>,
  ) => Generator<Yielded, void, never>,
): RuleDefinition {
  const runtimeHandler: RuntimeRuleHandler = token => {
    // SAFETY: rule matching proves the runtime handle has the condition definition.
    const matched = token as LiveToken<
      DefinitionOf<Condition>,
      DefinitionName<DefinitionOf<Condition>>,
      readonly []
    >;
    // SAFETY: Yielded is constrained to Cascade mutation effects by Rule's generic.
    return handler(matched) as Generator<CascadeEffect<void, WriteAddress>, void, never>;
  };
  const definition: RuleDefinition = {condition, handler: runtimeHandler};
  ruleDefinitions.add(definition);
  return definition;
}

/** @since 0.1.0 */
export class RuleBundle {
  readonly entries: readonly RuntimeRule[];

  constructor(entries: readonly RuntimeRule[]) {
    this.entries = entries;
  }

  with(...names: readonly string[]): RuleBundle {
    return new RuleBundle(this.entries.filter(entry => names.includes(entry.name)));
  }

  without(...names: readonly string[]): RuleBundle {
    return new RuleBundle(this.entries.filter(entry => !names.includes(entry.name)));
  }
}

function nestedRuleName(prefix: string, key: string): string {
  return prefix.length === 0 ? key : `${prefix}.${key}`;
}

function flattenRule(options: {
  readonly output: RuntimeRule[];
  readonly prefix: string;
  readonly value: unknown;
  readonly key: string;
}): void {
  const name = nestedRuleName(options.prefix, options.key);
  if (ruleDefinitions.has(Object(options.value))) {
    // SAFETY: only Rule() adds values to the marker WeakSet.
    const definition = options.value as RuleDefinition;
    options.output.push({...definition, name});
    return;
  }
  if (options.value !== Object(options.value)) return;
  // SAFETY: the identity check excludes primitives before recursive traversal.
  flattenRules({output: options.output, prefix: name, tree: options.value as object});
}

function flattenRules(options: {
  readonly output: RuntimeRule[];
  readonly prefix: string;
  readonly tree: object;
}): void {
  for (const key of Object.keys(options.tree)) {
    // SAFETY: Object.keys returned key from this exact tree object.
    flattenRule({
      key,
      output: options.output,
      prefix: options.prefix,
      value: options.tree[key as keyof typeof options.tree],
    });
  }
}

/** @since 0.1.0 */
export function Rules<const Tree extends object>(tree: Tree): RuleBundle {
  const entries: RuntimeRule[] = [];
  flattenRules({output: entries, prefix: "", tree});
  return new RuleBundle(entries);
}

export type {
  /** @since 0.1.0 */
  RegisteredRule,
  /** @since 0.1.0 */
  RuleValidation,
};
