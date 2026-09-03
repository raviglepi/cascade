/** @since 0.1.0 */

import type {CascadeEffect, WriteAddress} from "./operation.ts";
import type {RuntimeRule, RuleFailure} from "./rules.ts";
import type {
  DefinitionName,
  DefinitionOf,
  ExpandAlias,
  LiveToken,
  TokenDefinitionRef,
  TokenInstanceRef,
  TokenRoot,
  TokenValue,
  ValueOf,
} from "./token.ts";

import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import {OperationWritesId} from "./operation.ts";
import {
  expandRoot,
  getDetachedNegativeDefinitions,
  getDetachedRelations,
  getDetachedValue,
  isTokenDefinition,
} from "./token.ts";

type RelationWrite<
  Terms extends readonly TokenRoot[],
  Root extends string,
  Path extends readonly string[],
> = WriteAddress<
  Root,
  Path,
  {
    readonly definition: DefinitionName<DefinitionOf<ExpandAlias<Terms[number]>>>;
    readonly kind: "relation";
  }
>;

interface LiveNode {
  readonly blueprint: TokenInstanceRef;
  readonly incoming: Set<LiveNode>;
  readonly outgoing: Map<TokenDefinitionRef, LiveNode>;
  rootReferences: number;
  valueState: {readonly kind: "absent"} | {readonly kind: "present"; readonly value: unknown};
}

interface GraphState {
  readonly activeMatches: Map<RuntimeRule, Set<number>>;
  readonly changedDefinitions: Set<TokenDefinitionRef>;
  changed: boolean;
  draining: boolean;
  readonly negativeRules: Set<RuntimeRule>;
  readonly nodes: Map<TokenInstanceRef, LiveNode>;
  pendingRuleScan: boolean;
  readonly rulesByDefinition: Map<TokenDefinitionRef, Set<RuntimeRule>>;
}

interface RuleEntry {
  readonly node: LiveNode;
  readonly rule: RuntimeRule;
}

type DrainCompletion =
  | {readonly kind: "continue"}
  | {readonly changed: boolean; readonly kind: "complete"};

/**
 * Roots retained by a Cascade runtime.
 *
 * **When to use**
 *
 * Keep this value for as long as a mounted graph branch should remain live.
 * Run {@link MountedRoots.release} when the caller no longer owns the branch.
 *
 * @since 0.1.0
 * @category Models
 */
export interface MountedRoots {
  readonly roots: readonly LiveToken[];
  /** Shared revision which advances after each complete outer mutation. */
  readonly revision: SubscriptionRef.SubscriptionRef<number>;
  /** Releases this mount and recursively removes orphaned branches. */
  readonly release: Effect.Effect<void>;
}

/**
 * Executes and observes one configured Cascade graph.
 *
 * **When to use**
 *
 * Allocate a runtime from {@link Cascade.gen}, mount token roots through it,
 * and consume {@link CascadeRuntime.ruleFailures} when an adapter needs to
 * report failed rule invocations.
 *
 * @since 0.1.0
 * @category Models
 */
export interface CascadeRuntime {
  /** Mounts token roots and returns their live handles. */
  readonly mount: (...roots: readonly TokenRoot[]) => Effect.Effect<MountedRoots>;
  /** Broadcasts one event for every failed synchronous rule invocation. */
  readonly ruleFailures: Stream.Stream<RuleFailure>;
}

interface RuntimeOperations extends CascadeRuntime {
  readonly add: (node: LiveNode, roots: readonly TokenRoot[]) => Effect.Effect<void>;
  readonly del: (node: LiveNode, roots: readonly TokenRoot[]) => Effect.Effect<void>;
  readonly findRelated: (
    node: LiveNode,
    target: TokenDefinitionRef | TokenInstanceRef,
  ) => LiveNode | undefined;
  readonly handle: <Root extends string, Path extends readonly string[]>(
    node: LiveNode,
    root: Root,
    path: Path,
  ) => LiveToken<TokenDefinitionRef, Root, Path>;
  readonly releaseRoots: (nodes: readonly LiveNode[]) => Effect.Effect<void>;
  readonly set: (node: LiveNode, roots: readonly TokenRoot[]) => Effect.Effect<void>;
  readonly setValue: (node: LiveNode, value: TokenValue) => Effect.Effect<void>;
}

/** @internal */
export class CascadeRuntimeService extends Context.Service<
  CascadeRuntimeService,
  RuntimeOperations
>()("@cascade/core/CascadeRuntime") {}

function makeOperation<Writes extends WriteAddress>(options: {
  readonly effect: Effect.Effect<void>;
  readonly writes: Writes;
}): CascadeEffect<void, Writes> {
  // SAFETY: `CascadeEffect` only augments Effect with this exact write marker.
  return Object.assign(options.effect, {[OperationWritesId]: options.writes}) as CascadeEffect<
    void,
    Writes
  >;
}

function collectPositiveDefinitions(
  pattern: TokenInstanceRef,
  output: Set<TokenDefinitionRef>,
): void {
  for (const relation of getDetachedRelations(pattern)) {
    output.add(relation.definition);
    collectPositiveDefinitions(relation, output);
  }
}

function definitionsConflict(left: TokenDefinitionRef, right: TokenDefinitionRef): boolean {
  return left.excludedDefinitions.includes(right) || right.excludedDefinitions.includes(left);
}

class MountedRootsImpl implements MountedRoots {
  readonly release: Effect.Effect<void>;
  readonly roots: readonly LiveToken[];
  readonly revision: SubscriptionRef.SubscriptionRef<number>;
  readonly #nodes: readonly LiveNode[];
  readonly #runtime: RuntimeOperations;
  #released = false;

  constructor(options: {
    readonly nodes: readonly LiveNode[];
    readonly revision: SubscriptionRef.SubscriptionRef<number>;
    readonly roots: readonly LiveToken[];
    readonly runtime: RuntimeOperations;
  }) {
    this.#nodes = options.nodes;
    this.revision = options.revision;
    this.roots = options.roots;
    this.#runtime = options.runtime;
    this.release = Effect.suspend(() => {
      if (this.#released) return Effect.void;
      this.#released = true;
      return this.#runtime.releaseRoots(this.#nodes);
    });
  }
}

class LiveTokenImpl<
  Definition extends TokenDefinitionRef,
  Root extends string,
  Path extends readonly string[],
> implements LiveToken<Definition, Root, Path> {
  readonly definition: Definition;
  readonly id: number;
  readonly #node: LiveNode;
  readonly #path: Path;
  readonly #root: Root;
  readonly #runtime: RuntimeOperations;

  constructor(options: {
    readonly node: LiveNode;
    readonly path: Path;
    readonly root: Root;
    readonly runtime: RuntimeOperations;
  }) {
    this.#node = options.node;
    this.#path = options.path;
    this.#root = options.root;
    this.#runtime = options.runtime;
    // SAFETY: every handle is created from the definition selected by its typed construction path.
    this.definition = options.node.blueprint.definition as Definition;
    this.id = options.node.blueprint.id;
  }

  add<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>> {
    return makeOperation({
      effect: this.#runtime.add(this.#node, terms),
      writes: {path: this.#path, root: this.#root, slot: {kind: "relations"}},
    });
  }

  del<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, RelationWrite<Terms, Root, Path>> {
    // SAFETY: every joined name is derived from one of `Terms`.
    const definition = terms
      .map(term => expandRoot(term).definition.name)
      .join("|") as DefinitionName<DefinitionOf<ExpandAlias<Terms[number]>>>;
    return makeOperation({
      effect: this.#runtime.del(this.#node, terms),
      writes: {path: this.#path, root: this.#root, slot: {definition, kind: "relation"}},
    });
  }

  get<Target extends TokenDefinitionRef>(
    target: Target,
  ): LiveToken<Target, Root, readonly [...Path, DefinitionName<Target>]>;
  get<Pattern extends TokenInstanceRef>(
    pattern: Pattern,
  ): LiveToken<
    DefinitionOf<Pattern>,
    Root,
    readonly [...Path, DefinitionName<DefinitionOf<Pattern>>]
  >;
  get(
    target: TokenDefinitionRef | TokenInstanceRef,
  ): LiveToken<TokenDefinitionRef, Root, readonly string[]> {
    const definition = isTokenDefinition(target) ? target : target.definition;
    const node = this.#runtime.findRelated(this.#node, target);
    if (node === undefined)
      throw new Error(
        `Token ${this.definition.name}#${this.id} has no ${definition.name} relation`,
      );
    return new LiveTokenImpl({
      node,
      path: [...this.#path, definition.name],
      root: this.#root,
      runtime: this.#runtime,
    });
  }

  hasValue(): boolean {
    return this.#node.valueState.kind === "present";
  }
  pipe<Result>(operation: (token: this) => Result): Result {
    return operation(this);
  }

  set<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>> {
    return makeOperation({
      effect: this.#runtime.set(this.#node, terms),
      writes: {path: this.#path, root: this.#root, slot: {kind: "relations"}},
    });
  }

  setValue(
    value: ValueOf<Definition>,
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "value"}>> {
    return makeOperation({
      effect: this.#runtime.setValue(this.#node, value),
      writes: {path: this.#path, root: this.#root, slot: {kind: "value"}},
    });
  }

  tokens(): readonly LiveToken[] {
    return [...this.#node.outgoing.values()].map(node =>
      this.#runtime.handle(node, this.#root, [...this.#path, node.blueprint.definition.name]),
    );
  }

  value(): ValueOf<Definition> | undefined {
    // SAFETY: this node was constructed from a `TokenInstanceRef` of `Definition`.
    return this.#node.valueState.kind === "present"
      ? (this.#node.valueState.value as ValueOf<Definition>)
      : undefined;
  }
}

function initialState(rules: readonly RuntimeRule[]): GraphState {
  const activeMatches = new Map<RuntimeRule, Set<number>>();
  const negativeRules = new Set<RuntimeRule>();
  const rulesByDefinition = new Map<TokenDefinitionRef, Set<RuntimeRule>>();
  const indexRule = (definition: TokenDefinitionRef, rule: RuntimeRule): void => {
    const indexed = rulesByDefinition.get(definition);
    if (indexed === undefined) rulesByDefinition.set(definition, new Set([rule]));
    else indexed.add(rule);
  };
  for (const rule of rules) {
    activeMatches.set(rule, new Set());
    const positives = new Set<TokenDefinitionRef>();
    collectPositiveDefinitions(rule.condition, positives);
    indexRule(rule.condition.definition, rule);
    if (positives.size === 0 && getDetachedNegativeDefinitions(rule.condition).length > 0)
      negativeRules.add(rule);
    else for (const definition of positives) indexRule(definition, rule);
  }
  return {
    activeMatches,
    changed: false,
    changedDefinitions: new Set(),
    draining: false,
    negativeRules,
    nodes: new Map(),
    pendingRuleScan: false,
    rulesByDefinition,
  };
}

function markChanged(state: GraphState, definition: TokenDefinitionRef): void {
  state.changedDefinitions.add(definition);
}

function matches(node: LiveNode, pattern: TokenInstanceRef): boolean {
  if (node.blueprint.definition !== pattern.definition) return false;
  const patternValue = getDetachedValue(pattern);
  if (
    patternValue.kind === "present" &&
    (node.valueState.kind === "absent" || !Object.is(node.valueState.value, patternValue.value))
  )
    return false;
  const neighbours = [...node.outgoing.values(), ...node.incoming];
  for (const negative of getDetachedNegativeDefinitions(pattern))
    if (neighbours.some(neighbour => neighbour.blueprint.definition === negative)) return false;
  for (const relation of getDetachedRelations(pattern))
    if (!neighbours.some(neighbour => matches(neighbour, relation))) return false;
  return true;
}

function mountNode(state: GraphState, blueprint: TokenInstanceRef): LiveNode {
  const mounted = state.nodes.get(blueprint);
  if (mounted !== undefined) return mounted;
  const node: LiveNode = {
    blueprint,
    incoming: new Set(),
    outgoing: new Map(),
    rootReferences: 0,
    valueState: getDetachedValue(blueprint),
  };
  state.nodes.set(blueprint, node);
  markChanged(state, blueprint.definition);
  for (const relation of getDetachedRelations(blueprint)) {
    const target = mountNode(state, relation);
    node.outgoing.set(relation.definition, target);
    target.incoming.add(node);
  }
  return node;
}

function removeIfOrphaned(state: GraphState, node: LiveNode): void {
  if (node.rootReferences > 0 || node.incoming.size > 0) return;
  state.nodes.delete(node.blueprint);
  markChanged(state, node.blueprint.definition);
  for (const target of node.outgoing.values()) {
    target.incoming.delete(node);
    removeIfOrphaned(state, target);
  }
  node.outgoing.clear();
}

function detach(state: GraphState, owner: LiveNode, target: LiveNode): void {
  target.incoming.delete(owner);
  removeIfOrphaned(state, target);
}

function removeRelation(state: GraphState, owner: LiveNode, definition: TokenDefinitionRef): void {
  const target = owner.outgoing.get(definition);
  if (target === undefined) return;
  owner.outgoing.delete(definition);
  markChanged(state, owner.blueprint.definition);
  markChanged(state, target.blueprint.definition);
  detach(state, owner, target);
}

function mergeRelation(state: GraphState, owner: LiveNode, blueprint: TokenInstanceRef): void {
  markChanged(state, owner.blueprint.definition);
  markChanged(state, blueprint.definition);
  for (const [definition] of owner.outgoing)
    if (
      definition !== blueprint.definition &&
      definitionsConflict(definition, blueprint.definition)
    )
      removeRelation(state, owner, definition);
  const existing = owner.outgoing.get(blueprint.definition);
  if (existing?.blueprint === blueprint) return;
  if (existing !== undefined) detach(state, owner, existing);
  const target = mountNode(state, blueprint);
  owner.outgoing.set(blueprint.definition, target);
  target.incoming.add(owner);
}

function takeCandidateRules(state: GraphState): ReadonlySet<RuntimeRule> {
  const candidates = new Set(state.negativeRules);
  for (const definition of state.changedDefinitions) {
    const indexed = state.rulesByDefinition.get(definition);
    if (indexed !== undefined) for (const rule of indexed) candidates.add(rule);
  }
  state.changedDefinitions.clear();
  return candidates;
}

function findRuleEntries(
  state: GraphState,
  candidates: ReadonlySet<RuntimeRule>,
): readonly RuleEntry[] {
  const entries: RuleEntry[] = [];
  for (const [rule, previous] of state.activeMatches) {
    if (!candidates.has(rule)) continue;
    const current = new Set<number>();
    for (const node of state.nodes.values()) {
      if (!matches(node, rule.condition)) continue;
      current.add(node.blueprint.id);
      if (!previous.has(node.blueprint.id)) entries.push({node, rule});
    }
    state.activeMatches.set(rule, current);
  }
  return entries;
}

const makeRuntime = Effect.fn("CascadeRuntime.make")(function* (rules: readonly RuntimeRule[]) {
  const initial = initialState(rules);
  const state = yield* Ref.make(initial);
  const failurePubSub = yield* PubSub.unbounded<RuleFailure>();
  const revision = yield* SubscriptionRef.make(0);
  let runtime: RuntimeOperations;

  const runRule = Effect.fn("CascadeRuntime.runRule")(function* (entry: RuleEntry) {
    const token = runtime.handle(entry.node, entry.node.blueprint.definition.name, [] as const);
    const exit = yield* Effect.exit(Effect.gen(() => entry.rule.handler(token)));
    if (Exit.isFailure(exit))
      yield* PubSub.publish(failurePubSub, {
        cause: Cause.squash(exit.cause),
        rule: entry.rule.name,
        token,
      });
  });

  const drainRules = Effect.fn("CascadeRuntime.drainRules")(function* () {
    while (true) {
      const entries = yield* Ref.modify(state, current => {
        if (!current.pendingRuleScan) return [undefined, current] as const;
        current.pendingRuleScan = false;
        return [findRuleEntries(current, takeCandidateRules(current)), current] as const;
      });
      if (entries !== undefined) {
        yield* Effect.forEach(entries, runRule, {concurrency: 1, discard: true});
        continue;
      }
      const completion = yield* Ref.modify(
        state,
        (current): readonly [DrainCompletion, GraphState] => {
          if (current.pendingRuleScan) return [{kind: "continue"}, current];
          const changed = current.changed;
          current.changed = false;
          current.draining = false;
          return [{changed, kind: "complete"}, current];
        },
      );
      if (completion.kind === "continue") continue;
      if (completion.changed) yield* SubscriptionRef.update(revision, current => current + 1);
      return;
    }
  });

  const change = Effect.fn("CascadeRuntime.change")(function* (
    mutation: (state: GraphState) => void,
  ) {
    const shouldDrain = yield* Ref.modify(state, current => {
      mutation(current);
      current.changed = true;
      current.pendingRuleScan = true;
      if (current.draining) return [false, current] as const;
      current.draining = true;
      return [true, current] as const;
    });
    if (shouldDrain) yield* drainRules();
  });

  const handle = <Root extends string, Path extends readonly string[]>(
    node: LiveNode,
    root: Root,
    path: Path,
  ): LiveToken<TokenDefinitionRef, Root, Path> => new LiveTokenImpl({node, path, root, runtime});
  const add = Effect.fn("CascadeRuntime.add")(function* (
    node: LiveNode,
    roots: readonly TokenRoot[],
  ) {
    yield* change(current => {
      for (const root of roots) mergeRelation(current, node, expandRoot(root));
    });
  });
  const del = Effect.fn("CascadeRuntime.del")(function* (
    node: LiveNode,
    roots: readonly TokenRoot[],
  ) {
    yield* change(current => {
      for (const root of roots) removeRelation(current, node, expandRoot(root).definition);
    });
  });
  const findRelated = (
    node: LiveNode,
    target: TokenDefinitionRef | TokenInstanceRef,
  ): LiveNode | undefined => {
    const definition = isTokenDefinition(target) ? target : target.definition;
    const direct = node.outgoing.get(definition);
    if (direct !== undefined && (isTokenDefinition(target) || matches(direct, target)))
      return direct;
    for (const incoming of node.incoming)
      if (
        incoming.blueprint.definition === definition &&
        (isTokenDefinition(target) || matches(incoming, target))
      )
        return incoming;
    return undefined;
  };
  const releaseRoots = Effect.fn("CascadeRuntime.releaseRoots")(function* (
    nodes: readonly LiveNode[],
  ) {
    yield* change(current => {
      for (const node of nodes) {
        node.rootReferences -= 1;
        removeIfOrphaned(current, node);
      }
    });
  });
  const set = Effect.fn("CascadeRuntime.set")(function* (
    node: LiveNode,
    roots: readonly TokenRoot[],
  ) {
    yield* change(current => {
      for (const definition of node.outgoing.keys()) removeRelation(current, node, definition);
      for (const root of roots) mergeRelation(current, node, expandRoot(root));
    });
  });
  const setValue = Effect.fn("CascadeRuntime.setValue")(function* (
    node: LiveNode,
    value: TokenValue,
  ) {
    yield* change(current => {
      node.valueState = {kind: "present", value};
      markChanged(current, node.blueprint.definition);
    });
  });
  const mount = Effect.fn("CascadeRuntime.mount")(function* (...roots: readonly TokenRoot[]) {
    const [mounted, shouldDrain] = yield* Ref.modify(state, current => {
      const nodes = roots.map(root => mountNode(current, expandRoot(root)));
      for (const node of nodes) node.rootReferences += 1;
      current.changed = true;
      current.pendingRuleScan = true;
      const claim = !current.draining;
      current.draining = true;
      return [[nodes, claim] as const, current] as const;
    });
    if (shouldDrain) yield* drainRules();
    return new MountedRootsImpl({
      nodes: mounted,
      revision,
      roots: mounted.map(node => handle(node, node.blueprint.definition.name, [] as const)),
      runtime,
    });
  });

  runtime = {
    add,
    del,
    findRelated,
    handle,
    mount,
    releaseRoots,
    ruleFailures: Stream.fromPubSub(failurePubSub),
    set,
    setValue,
  };
  return CascadeRuntimeService.of(runtime);
});

/** @internal */
export const layer = (rules: readonly RuntimeRule[]) =>
  Layer.effect(CascadeRuntimeService, makeRuntime(rules));
