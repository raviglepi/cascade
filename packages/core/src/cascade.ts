/** @since 0.1.0 */

import type {CascadeRuntime} from "./graph.ts";
import type {CascadeEffect, WriteAddress} from "./operation.ts";
import type {
  ConditionOf,
  NextRegisteredRule,
  RegisteredRule,
  RuleValidation,
  RuleSetValidation,
  RuntimeRule,
  RuntimeRuleHandler,
} from "./rules.ts";
import type {DefinitionName, DefinitionOf, LiveToken, TokenInstanceRef} from "./token.ts";

import {Effect} from "effect";

import {make as makeRuntime} from "./graph.ts";
import {RuleBundle} from "./rules.ts";

/**
 * Immutable builder for a Cascade runtime and its rule set.
 *
 * **When to use**
 *
 * Create one builder for each independently configured graph, add rule bundles
 * and rules, then call {@link Cascade.make} to allocate an executable runtime.
 *
 * @since 0.2.0
 * @category Models
 */
export class Cascade<Registered extends RegisteredRule = never> {
  readonly #rules: readonly RuntimeRule[];

  constructor(rules: readonly RuntimeRule[] = []) {
    this.#rules = rules;
  }

  extend<BundleRegistered extends RegisteredRule>(
    bundle: RuleBundle<BundleRegistered> & RuleSetValidation<Registered, BundleRegistered>,
  ): Cascade<Registered | BundleRegistered> {
    return new Cascade([...this.#rules, ...bundle.entries]);
  }

  /**
   * Allocates a fresh runtime for this builder's rules.
   *
   * The returned effect is synchronous and has no failure channel. Running it
   * creates independent graph state and broadcast streams for graph changes
   * and rule failures.
   *
   * @since 0.2.0
   * @category Constructors
   */
  make(): Effect.Effect<CascadeRuntime> {
    return makeRuntime(this.#rules);
  }

  rule<Condition extends TokenInstanceRef, Yielded extends CascadeEffect<void, WriteAddress>>(
    condition: Condition,
    handler: (
      token: LiveToken<
        DefinitionOf<Condition>,
        DefinitionName<DefinitionOf<Condition>>,
        readonly []
      >,
    ) => Generator<Yielded, void, never> &
      RuleValidation<Registered, ConditionOf<Condition>, Yielded>,
  ): Cascade<NextRegisteredRule<Registered, Condition, Yielded>> {
    const runtimeHandler: RuntimeRuleHandler = token => {
      // SAFETY: the scheduler only invokes a rule for its own matching definition.
      const matched = token as LiveToken<
        DefinitionOf<Condition>,
        DefinitionName<DefinitionOf<Condition>>,
        readonly []
      >;
      return handler(matched);
    };
    const rule: RuntimeRule = {
      condition,
      handler: runtimeHandler,
      name: `${condition.definition.name}.${this.#rules.length + 1}`,
    };
    return new Cascade([...this.#rules, rule]);
  }
}
