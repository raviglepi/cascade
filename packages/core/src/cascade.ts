/** @since 0.1.0 */

import type {CascadeRuntime} from "./graph.ts";
import type {
  NextRegisteredRule,
  RegisteredRule,
  RuleValidation,
  RuntimeRule,
  RuntimeRuleHandler,
} from "./rules.ts";
import type {DefinitionName, DefinitionOf, LiveToken, TokenInstanceRef} from "./token.ts";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {CascadeRuntimeService, layer as runtimeLayer} from "./graph.ts";
import {RuleBundle} from "./rules.ts";

const makeRuntime = Effect.fn("Cascade.gen")(function* (rules: readonly RuntimeRule[]) {
  const context = yield* Layer.build(runtimeLayer(rules));
  return Context.get(context, CascadeRuntimeService);
});

/**
 * Immutable builder for a Cascade runtime and its rule set.
 *
 * **When to use**
 *
 * Create one builder for each independently configured graph, add rule bundles
 * and rules, then call {@link Cascade.gen} to allocate an executable runtime.
 *
 * @since 0.1.0
 * @category Models
 */
export class Cascade<Registered extends RegisteredRule = never> {
  readonly #rules: readonly RuntimeRule[];

  constructor(rules: readonly RuntimeRule[] = []) {
    this.#rules = rules;
  }

  extend(bundle: RuleBundle): Cascade<Registered> {
    return new Cascade([...this.#rules, ...bundle.entries]);
  }

  /**
   * Allocates a fresh runtime for this builder's rules.
   *
   * The returned effect is synchronous and has no failure channel. Running it
   * creates independent graph state, a revision reference, and a broadcast
   * stream for rule failures.
   *
   * @since 0.1.0
   * @category Constructors
   */
  gen(): Effect.Effect<CascadeRuntime> {
    return Effect.scoped(makeRuntime(this.#rules));
  }

  /**
   * Creates the runtime layer for this rule set.
   *
   * @internal
   */
  layer(): Layer.Layer<CascadeRuntimeService> {
    return runtimeLayer(this.#rules);
  }

  rule<
    Condition extends TokenInstanceRef,
    Yielded extends import("./operation.ts").CascadeEffect<
      void,
      import("./operation.ts").WriteAddress
    >,
  >(
    condition: Condition,
    handler: (
      token: LiveToken<
        DefinitionOf<Condition>,
        DefinitionName<DefinitionOf<Condition>>,
        readonly []
      >,
    ) => Generator<Yielded, void, never> &
      RuleValidation<Registered, import("./rules.ts").ConditionOf<Condition>, Yielded>,
  ): Cascade<NextRegisteredRule<Registered, Condition, Yielded>> {
    const runtimeHandler: RuntimeRuleHandler = token => {
      // SAFETY: runtime matching proves the handle definition equals the condition definition.
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
