/** @since 0.1.0 */

import type {IsEqual, IsNever} from "type-fest";
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

import {Predicate} from "effect";

/** @since 0.2.0 */
export interface RuleFailure {
  readonly cause: Cause.Cause<never>;
  readonly rule: string;
  readonly token: LiveToken;
}

/** @internal */
export type RuleFailureListener = (failure: RuleFailure) => void;

/** @internal */
export type RuntimeRuleHandler = (
  token: LiveToken<TokenDefinitionRef, string, readonly []>,
) => Generator<CascadeEffect<void, WriteAddress>, void, never>;

/** @internal */
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
export interface RegisteredRule<
  Condition extends ConditionSummary = ConditionSummary,
  Writes extends WriteAddress = WriteAddress,
  Name extends string = string,
> {
  readonly condition: Condition;
  readonly name: Name;
  readonly writes: Writes;
}

type Names<Definitions extends TokenDefinitionRef> = Definitions extends TokenDefinitionRef
  ? DefinitionName<Definitions>
  : never;

type ExcludedNames<Definitions extends TokenDefinitionRef> = Definitions extends TokenDefinitionRef
  ? Names<ExcludedBy<Definitions>>
  : never;

/** @since 0.2.0 */
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

type SamePath<Left extends readonly string[], Right extends readonly string[]> = IsEqual<
  Left,
  Right
>;

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

/** @internal */
export type RuleValidation<
  Earlier extends RegisteredRule,
  Condition extends ConditionSummary,
  Yielded,
> = [IsNever<Yielded>] extends [true]
  ? object
  : Yielded extends CascadeEffect<void, WriteAddress>
    ? [ConflictWithEarlier<Earlier, Condition, WritesOf<Yielded>>] extends [never]
      ? object
      : {
          readonly "Cascade rule conflict": "conditions overlap and write the same target";
          readonly write: ConflictWithEarlier<Earlier, Condition, WritesOf<Yielded>>;
        }
    : {readonly "Cascade rule error": "handlers may only yield Cascade operations"};

/** @internal */
export type NextRegisteredRule<
  Earlier extends RegisteredRule,
  Condition extends TokenInstanceRef,
  Yielded,
> = Earlier | RegisteredRule<ConditionOf<Condition>, WritesOf<Yielded>>;

declare const RuleDefinitionTypeId: unique symbol;

/** @since 0.2.0 */
export interface RuleDefinition<
  Condition extends TokenInstanceRef = TokenInstanceRef,
  Yielded extends CascadeEffect<void, WriteAddress> = CascadeEffect<void, WriteAddress>,
> {
  readonly condition: Condition;
  readonly handler: RuntimeRuleHandler;
  readonly [RuleDefinitionTypeId]?: RegisteredRule<ConditionOf<Condition>, WritesOf<Yielded>>;
}

const ruleDefinitions = new WeakSet<object>();

/** @since 0.2.0 */
export function Rule<
  Condition extends TokenInstanceRef,
  Yielded extends CascadeEffect<void, WriteAddress>,
>(
  condition: Condition,
  handler: (
    token: LiveToken<DefinitionOf<Condition>, DefinitionName<DefinitionOf<Condition>>, readonly []>,
  ) => Generator<Yielded, void, never>,
): RuleDefinition<Condition, Yielded> {
  const runtimeHandler: RuntimeRuleHandler = token => {
    // SAFETY: the scheduler only invokes a rule for its own matching definition.
    const matched = token as LiveToken<
      DefinitionOf<Condition>,
      DefinitionName<DefinitionOf<Condition>>,
      readonly []
    >;
    // SAFETY: Rule constrains every yielded operation to CascadeEffect.
    return handler(matched) as Generator<CascadeEffect<void, WriteAddress>, void, never>;
  };
  const definition: RuleDefinition<Condition, Yielded> = {condition, handler: runtimeHandler};
  ruleDefinitions.add(definition);
  return definition;
}

type RuleMetadata<Definition> =
  Definition extends RuleDefinition<
    infer Condition extends TokenInstanceRef,
    infer Yielded extends CascadeEffect<void, WriteAddress>
  >
    ? RegisteredRule<ConditionOf<Condition>, WritesOf<Yielded>>
    : never;

type RuleName<Prefix extends string, Key extends string> = Prefix extends ""
  ? Key
  : `${Prefix}.${Key}`;

type RuleTreeMetadata<Tree, Prefix extends string = ""> = Tree extends RuleDefinition
  ? RuleMetadata<Tree> extends RegisteredRule<
      infer Condition extends ConditionSummary,
      infer Writes extends WriteAddress
    >
    ? RegisteredRule<Condition, Writes, Prefix>
    : never
  : Tree extends object
    ? {
        [Key in keyof Tree & string]: RuleTreeMetadata<Tree[Key], RuleName<Prefix, Key>>;
      }[keyof Tree & string]
    : never;

type RuleSetConflict<Earlier extends RegisteredRule, Rules extends RegisteredRule> =
  Rules extends RegisteredRule<
    infer Condition extends ConditionSummary,
    infer Writes extends WriteAddress
  >
    ? ConflictWithEarlier<Earlier, Condition, Writes>
    : never;

type InternalRuleSetConflict<
  Rules extends RegisteredRule,
  Candidate extends RegisteredRule = Rules,
> =
  Candidate extends RegisteredRule<
    infer Condition extends ConditionSummary,
    infer Writes extends WriteAddress,
    infer Name extends string
  >
    ? ConflictWithEarlier<Exclude<Rules, {readonly name: Name}>, Condition, Writes>
    : never;

/** @internal */
export type RuleSetValidation<Earlier extends RegisteredRule, Rules extends RegisteredRule> =
  IsNever<RuleSetConflict<Earlier, Rules> | InternalRuleSetConflict<Rules>> extends true
    ? object
    : {readonly "Cascade rule conflict": "conditions overlap and write the same target"};

/** @since 0.2.0 */
export class RuleBundle<Registered extends RegisteredRule = never> {
  readonly entries: readonly RuntimeRule[];

  constructor(entries: readonly RuntimeRule[]) {
    this.entries = entries;
  }

  with<const Names extends readonly string[]>(
    ...names: Names
  ): RuleBundle<Extract<Registered, {readonly name: Names[number]}>> {
    return new RuleBundle(this.entries.filter(entry => names.includes(entry.name)));
  }

  without<const Names extends readonly string[]>(
    ...names: Names
  ): RuleBundle<Exclude<Registered, {readonly name: Names[number]}>> {
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
  if (isRuleDefinition(options.value)) {
    const definition = options.value;
    options.output.push({...definition, name});
    return;
  }
  if (Predicate.isObject(options.value))
    flattenRules({output: options.output, prefix: name, tree: options.value});
}

function isRuleDefinition(value: unknown): value is RuleDefinition {
  return ruleDefinitions.has(Object(value));
}

function flattenRules(options: {
  readonly output: RuntimeRule[];
  readonly prefix: string;
  readonly tree: object;
}): void {
  for (const [key, value] of Object.entries(options.tree)) {
    flattenRule({key, output: options.output, prefix: options.prefix, value});
  }
}

/** @since 0.2.0 */
export function Rules<const Tree extends object>(tree: Tree): RuleBundle<RuleTreeMetadata<Tree>> {
  const entries: RuntimeRule[] = [];
  flattenRules({output: entries, prefix: "", tree});
  return new RuleBundle(entries);
}
