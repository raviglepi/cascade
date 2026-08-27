import * as Effect from "effect/Effect";
import {CascadeRuntimeImpl} from "./graph.ts";
import type {CascadeRuntime} from "./graph.ts";
import type {
  NextRegisteredRule,
  RegisteredRule,
  RuleValidation,
  RuntimeRule,
  RuntimeRuleHandler,
} from "./rules.ts";
import {RuleBundle} from "./rules.ts";
import type {DefinitionName, DefinitionOf, LiveToken, TokenInstanceRef} from "./token.ts";

export class Cascade<Registered extends RegisteredRule = never> {
  readonly #rules: readonly RuntimeRule[];

  constructor(rules: readonly RuntimeRule[] = []) {
    this.#rules = rules;
  }

  extend(bundle: RuleBundle): Cascade<Registered> {
    return new Cascade([...this.#rules, ...bundle.entries]);
  }

  gen(): Effect.Effect<CascadeRuntime> {
    return Effect.sync(() => new CascadeRuntimeImpl(this.#rules));
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
