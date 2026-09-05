# Cascade 0.1 design

Cascade is a framework-agnostic, semantic UI runtime. Applications model what their UI represents as tokens and token relations. An adapter projects selected token graphs into a framework. The first adapter targets React, but React is not a core dependency.

This document records the agreed 0.1 contract. It deliberately excludes runtime schemas, async rules, portals, collection helpers, static loop detection, and richer selectors.

## Core language

### Token definitions and instances

A token definition is a named semantic definition such as `Name`, `Text`, `Disabled`, or `User`.

```ts
const Text = Token<string>("Text")();
const Name = Token("Name")(Text());
const Disabled = Token("Disabled")();
```

A token definition is callable. Calling it creates a new token instance. Each instance carries a reference to its originating definition and its own direct relations and optional value. Two `Name()` calls are distinct instances and can hold different values and relations.

The declaration API must give TypeScript both a token value and a corresponding instance type. The exact implementation may use a `const Token` factory plus a `type` or `interface Token` declaration. Token instances may use Effect `Data` for immutable description metadata, but live graph handles are not required to inherit from `Data.Class`.

The constructor accepts an optional value first, then token instances:

```ts
Text("Click here", Important());
Button(Ghost(), Text("Save"));
```

0.1 uses TypeScript type parameters for token values only. It performs no runtime Schema validation.

### Relations

A relation is a directed fact from one token instance to another. Cascade exposes it from either direction, without storing two edges.

```ts
Button(Disabled());
Disabled(Button());
```

These describe inverse views of the same relation. Exact reverse-query mechanics are an implementation choice.

A token instance can have at most one direct relation to a given token definition. If a model needs two roles carrying the same underlying token, it uses explicit wrapper definitions:

```ts
LegalName(Name());
DisplayName(Name());
```

Direct relation order is insertion order. It is the default order an adapter uses when projecting renderable relations.

Definition relations create fresh instances for each new parent instance. If `Name` declares `Text`, each `Name()` gets its own `Text()` relation.

### Exclusions

`Not(...)` states that the current token cannot coexist with another direct relation of the same owner.

```ts
const Ghost = Token("Ghost")(Not(Fill()));
const Alive = Token("Alive")(Not(Dead()));
```

Applying an incoming relation removes its excluded existing relations. A later merge can restore the old relation, which then removes the conflicting relation. A composition containing known incompatible relations should fail TypeScript checks. 0.1 does not revalidate unsafe casts at runtime.

Exclusions apply only to direct relations. `Button(Ghost(), Fill())` conflicts. `Button(Ghost(), Style(Fill()))` does not.

### Aliases

An alias is a shorthand for a token composition, not a graph token.

```ts
const GhostButton = Alias(Button(Ghost()));
```

Using `GhostButton` is exactly equivalent to using `Button(Ghost())`. It creates no `GhostButton` instance and rules query the tokens in the expanded composition.

## Live graph and mutation

Detached token instances carry token metadata and may serve as construction data, rule patterns, or render input. `Cascade.make()` allocates independent mounted graph state and observations.

The mutation API is Effectful and has both instance methods and pipeable `Token` helpers:

```ts
yield * user.get(Name()).pipe(Token.setValue("Jane"));
yield * button.pipe(Token.add(Ghost()));
yield * button.pipe(Token.del(Fill()));
yield * button.pipe(Token.set(Icon(), Text("Save")));
```

- `tokens()` is a getter for direct relations in their current order. It does not mutate state.
- `value()` reads a token's value.
- `add(...)` merges relations into the current direct relation set.
- `del(...)` detaches relations.
- `set(...)` replaces the entire direct relation set.
- `setValue(...)` replaces a token value.

Users derive partial changes by reading `tokens()`, transforming the result, then giving the whole replacement to `set(...)`.

Every public mutation is evaluated as one before-and-after state change. Rules never see intermediate removals and additions within a `set(...)` or merge.

## Ownership and cleanup

`runtime.mount(...)` returns a `Mount` with live `roots`, a `changes` stream, and `release`. The changes stream emits once when a consumer subscribes, then after each complete outer graph mutation. Calling `release` more than once releases the mount only once.

Mounted branches are retained by root references. A token remains live while a root or incoming direct relation points to it. If a relation removal leaves a token with no direct relation, Cascade deletes it; that can recursively orphan and remove its descendants.

For example, removing `User -> Name` removes `Name -> Text` when `Name` has no other incoming direct relation.

## Conditions and rules

Rules are declared before the engine is started:

```ts
const cascade = new Cascade()
  .extend(CascadeReact.Rules)
  .rule(Button(Disabled()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  });

const runtime = yield * cascade.make();
```

`.rule(condition, generator)` stores the generator. Chaining `.rule(...)` accumulates typed rule metadata. `.make()` builds the executable Effect and starts the rule engine when the caller chooses.

The rule handler receives the outer matched token. Related tokens are accessed explicitly with `.get(TokenDefinitionOrPattern)`. This avoids dynamic property proxies.

Conditions are token-instance metadata used structurally:

- Definitions match by their originating definition reference.
- A condition matches when its listed relations are a subset of the target's direct relations.
- Values are ignored unless the condition explicitly includes one, such as `Text("Save")`.
- A condition with only `Not(...)` terms is valid but may require a full graph scan.
- Mutation has already normalized exclusions, so query evaluation assumes valid state rather than rechecking `Not(...)`.

Rules run when a token enters a condition. Existing matches enter once when `.make()` starts. A rule does not rerun merely because unrelated state changes while its condition remains true.

Cascade indexes positive token definitions in conditions. A mutation finds candidate rules through the definitions it changed, then evaluates each full condition. Purely negative conditions are allowed and scan the graph.

Rule order is stable:

1. Changes that occurred earlier trigger their rules first.
2. Rules triggered by the same change run in definition order.

0.1 rules are synchronous. They may use Cascade's read and mutation Effects, but do not await external work. Fetching, timers, subscriptions, and similar effects run outside the rule engine, then submit a later mutation.

Rule operations must carry Cascade-specific typed metadata for their reads and writes. Standard Effect success, error, and service types alone cannot express "this writes Opacity." The chained builder uses that metadata to reject rules that write the same target and can become active together. `Not(...)` exclusions establish disjointness.

For example, these two rules conflict because a button may be both disabled and ghost, and both rules write `Opacity`:

```ts
new Cascade()
  .rule(Button(Disabled()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  })
  .rule(Button(Ghost()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.8));
  }); // Type error: this condition can overlap an earlier Opacity write.
```

Each `.rule(...)` returns a new `Cascade` type that remembers the conditions and token fields written by the rules already registered. Its next `.rule(...)` argument is constrained against that accumulated type state. Cascade operations yielded inside the generator contribute their write metadata, so the builder can see that both examples write `Opacity` even though the handlers remain ordinary Effect-style generator code.

The author resolves the conflict by making the states exclusive. Either condition can require the absence of the other state:

```ts
new Cascade()
  .rule(Button(Disabled(), Not(Ghost())), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.5));
  })
  .rule(Button(Ghost()), function* (button) {
    yield* button.get(Opacity()).pipe(Token.setValue(0.8));
  });
```

Or the token definitions themselves can declare the exclusion, so `Disabled` and `Ghost` cannot coexist. Once the builder can prove the two conditions are disjoint, it accepts both rules. This is a compile-time guarantee for correctly typed Cascade operations. Unsafe casts and incorrect token type definitions are outside the guarantee.

0.1 does not promise static loop detection or a runtime loop cap. A rule loop is user code error.

Rules are intended to have error type `never`. A failure that bypasses this constraint keeps writes that already committed, stops that invocation, logs and reports `{ rule, token, cause }` to the adapter or application error handler, then continues other rules.

## Extensions and rendering

Cascade core exports only token mechanics. Framework packages contribute their own tokens, rules, host mappings, and error reporting.

```ts
const cascade = new Cascade()
  .extend(CascadeReact.Rules.without("layout.defaultText"))
  .extend(applicationRules);
```

Rule bundles are named nested objects. `extend()` flattens them. A package exposes `.without(...)` and `.with(...)` so applications explicitly choose adapter defaults rather than silently overriding conflicts.

`@cascade/react` supplies render primitives such as `Row`, `Column`, `Text`, `Image`, `ButtonElement`, basic style tokens, and basic listener tokens. Domain tokens become renderable by declaring relations to adapter element tokens. A token such as `Ghost` influences presentation but need not map to an element.

Adapters render every relation they can project. Direct insertion order is the default layout order. Rules can replace a token's full direct relation set through `set(...)`, allowing a matched state to choose a different order.

The semantic graph is not required to mirror the DOM. Adapters decide where listeners and host elements go. A non-renderable token with an event normally projects its listener to its nearest renderable output. If it projects into multiple host elements, the adapter can create a grouping host element and attach the listener there. Future rules may project a relation elsewhere, such as a hitbox or portal.

An adapter provides framework-native error UI and reporting. React render failures can use an Error Boundary. Rule failures are separately reported through the adapter, so one broken boundary does not have to replace unrelated UI.

## React integration

The application owns the Cascade instance and chooses its engine lifetime. A typical UI application constructs the instance and rules near its top level, calls `.make()`, then uses its renderer in selected React components.

```tsx
function Sidebar() {
  return <aside>{Cascade.render(ContactRows(/* tokens */))}</aside>;
}
```

`Cascade.render(...)` accepts ordered root tokens and returns JSX from the React adapter. It can appear anywhere in an existing React app. Cascade does not require the entire app to be modeled as Cascade tokens.

React-boundary rerendering is application-controlled. Giving `Cascade.render(...)` new token instances rerenders that boundary. Applications can keep the boundary stable, memoize it, or let tokens read external state when they want narrower updates. The adapter should memoize its own projected elements where practical, but Cascade 0.1 does not guarantee automatic reconciliation of newly supplied token branches.

## First proof of the design

0.1 should include a headless graph and rule test suite plus a small React contact-row demonstration. The demo models a contact with name, image, chat preview, and time. A compact or variant rule removes or reorders the chat preview while preserving unrelated name and image relations.

The first React adapter is intentionally small: basic layout primitives, text and image, a button host primitive, basic styles such as opacity, color, spacing, and visibility, simple listeners, and adapter error reporting. Portals, hitboxes, animations, responsiveness, accessibility policy, schemas, advanced selectors, and general collection helpers come later.
