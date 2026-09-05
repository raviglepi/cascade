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

import {Cause, Effect, Exit, Match, PubSub, Ref, Stream, SubscriptionRef} from "effect";

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

/** [internal](internal) */
function withoutStackTrace(cause: Cause.Cause<never>): Cause.Cause<never> {
  return Cause.fromReasons(
    cause.reasons.map(reason =>
      Match.value(reason).pipe(
        Match.when({_tag: "Die"}, reason => Cause.makeDieReason(reason.defect)),
        Match.when({_tag: "Fail"}, reason => Cause.makeFailReason(reason.error)),
        Match.when({_tag: "Interrupt"}, reason => Cause.makeInterruptReason(reason.fiberId)),
        Match.exhaustive,
      ),
    ),
  );
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
 * Run {@link Mount.release} when the caller no longer owns the branch.
 *
 * @since 0.1.0
 * @category Models
 */
export interface Mount {
  readonly roots: readonly LiveToken[];
  /** Emits once immediately, then after each complete outer graph mutation. */
  readonly changes: Stream.Stream<void>;
  /** Releases this mount once and recursively removes orphaned branches. */
  readonly release: Effect.Effect<void>;
}

/**
 * Executes and observes one configured Cascade graph.
 *
 * **When to use**
 *
 * Allocate a runtime from {@link Cascade.make}, mount token roots through it,
 * and consume {@link CascadeRuntime.ruleFailures} when an adapter needs to
 * report failed rule invocations.
 *
 * @since 0.1.0
 * @category Models
 */
export interface CascadeRuntime {
  /** Mounts token roots and returns their live handles. */
  readonly mount: (...roots: readonly TokenRoot[]) => Effect.Effect<Mount>;
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

class MountImpl implements Mount {
  readonly changes: Stream.Stream<void>;
  readonly release: Effect.Effect<void>;
  readonly roots: readonly LiveToken[];

  constructor(options: {
    readonly changes: Stream.Stream<void>;
    readonly release: Effect.Effect<void>;
    readonly roots: readonly LiveToken[];
  }) {
    this.changes = options.changes;
    this.release = options.release;
    this.roots = options.roots;
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

function indexRule(
  rulesByDefinition: Map<TokenDefinitionRef, Set<RuntimeRule>>,
  definition: TokenDefinitionRef,
  rule: RuntimeRule,
): void {
  const indexed = rulesByDefinition.get(definition);
  if (indexed === undefined) rulesByDefinition.set(definition, new Set([rule]));
  else indexed.add(rule);
}

function isNegativeOnlyRule(
  rule: RuntimeRule,
  positives: ReadonlySet<TokenDefinitionRef>,
): boolean {
  return positives.size === 0 && getDetachedNegativeDefinitions(rule.condition).length > 0;
}

function indexRuntimeRule(
  state: Pick<GraphState, "activeMatches" | "negativeRules" | "rulesByDefinition">,
  rule: RuntimeRule,
): void {
  state.activeMatches.set(rule, new Set());
  const positives = new Set<TokenDefinitionRef>();
  collectPositiveDefinitions(rule.condition, positives);
  indexRule(state.rulesByDefinition, rule.condition.definition, rule);
  if (isNegativeOnlyRule(rule, positives)) {
    state.negativeRules.add(rule);
    return;
  }
  for (const definition of positives) indexRule(state.rulesByDefinition, definition, rule);
}

function initialState(rules: readonly RuntimeRule[]): GraphState {
  const activeMatches = new Map<RuntimeRule, Set<number>>();
  const negativeRules = new Set<RuntimeRule>();
  const rulesByDefinition = new Map<TokenDefinitionRef, Set<RuntimeRule>>();
  const index = {activeMatches, negativeRules, rulesByDefinition};
  for (const rule of rules) indexRuntimeRule(index, rule);
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

function matchesValue(node: LiveNode, pattern: TokenInstanceRef): boolean {
  const patternValue = getDetachedValue(pattern);
  if (patternValue.kind === "absent") return true;
  if (node.valueState.kind === "absent") return false;
  return Object.is(node.valueState.value, patternValue.value);
}

function hasExcludedNeighbour(node: LiveNode, definition: TokenDefinitionRef): boolean {
  return [...node.outgoing.values(), ...node.incoming].some(
    neighbour => neighbour.blueprint.definition === definition,
  );
}

function matchesRelations(node: LiveNode, pattern: TokenInstanceRef): boolean {
  const neighbours = [...node.outgoing.values(), ...node.incoming];
  return (
    !getDetachedNegativeDefinitions(pattern).some(negative =>
      hasExcludedNeighbour(node, negative),
    ) &&
    getDetachedRelations(pattern).every(relation =>
      neighbours.some(neighbour => matches(neighbour, relation)),
    )
  );
}

function matches(node: LiveNode, pattern: TokenInstanceRef): boolean {
  if (node.blueprint.definition !== pattern.definition) return false;
  if (!matchesValue(node, pattern)) return false;
  return matchesRelations(node, pattern);
}

function targetDefinition(target: TokenDefinitionRef | TokenInstanceRef): TokenDefinitionRef {
  return isTokenDefinition(target) ? target : target.definition;
}

function matchesTarget(
  candidate: LiveNode,
  target: TokenDefinitionRef | TokenInstanceRef,
): boolean {
  if (isTokenDefinition(target)) return true;
  return matches(candidate, target);
}

function relatedNodeMatches(
  candidate: LiveNode,
  target: TokenDefinitionRef | TokenInstanceRef,
): boolean {
  const definition = targetDefinition(target);
  if (candidate.blueprint.definition !== definition) return false;
  return matchesTarget(candidate, target);
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

function isReferenced(node: LiveNode): boolean {
  return node.rootReferences > 0 || node.incoming.size > 0;
}

function removeIfOrphaned(state: GraphState, node: LiveNode): void {
  if (isReferenced(node)) return;
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

function removeConflictingRelations(
  state: GraphState,
  owner: LiveNode,
  blueprint: TokenInstanceRef,
): void {
  for (const [definition] of owner.outgoing)
    if (isConflictingRelation(definition, blueprint.definition))
      removeRelation(state, owner, definition);
}

function isConflictingRelation(left: TokenDefinitionRef, right: TokenDefinitionRef): boolean {
  return left !== right && definitionsConflict(left, right);
}

function hasBlueprint(existing: LiveNode | undefined, blueprint: TokenInstanceRef): boolean {
  return existing !== undefined && existing.blueprint === blueprint;
}

function detachExisting(state: GraphState, owner: LiveNode, existing: LiveNode | undefined): void {
  if (existing !== undefined) detach(state, owner, existing);
}

function attachRelation(state: GraphState, owner: LiveNode, blueprint: TokenInstanceRef): void {
  const existing = owner.outgoing.get(blueprint.definition);
  if (hasBlueprint(existing, blueprint)) return;
  detachExisting(state, owner, existing);
  const target = mountNode(state, blueprint);
  owner.outgoing.set(blueprint.definition, target);
  target.incoming.add(owner);
}

function mergeRelation(state: GraphState, owner: LiveNode, blueprint: TokenInstanceRef): void {
  markChanged(state, owner.blueprint.definition);
  markChanged(state, blueprint.definition);
  removeConflictingRelations(state, owner, blueprint);
  attachRelation(state, owner, blueprint);
}

function addIndexedRules(
  candidates: Set<RuntimeRule>,
  indexed: ReadonlySet<RuntimeRule> | undefined,
): void {
  if (indexed === undefined) return;
  for (const rule of indexed) candidates.add(rule);
}

function takeCandidateRules(state: GraphState): ReadonlySet<RuntimeRule> {
  const candidates = new Set(state.negativeRules);
  for (const definition of state.changedDefinitions)
    addIndexedRules(candidates, state.rulesByDefinition.get(definition));
  state.changedDefinitions.clear();
  return candidates;
}

function matchingNodeIds(state: GraphState, condition: TokenInstanceRef): Set<number> {
  const matchedIds = new Set<number>();
  for (const node of state.nodes.values())
    if (matches(node, condition)) matchedIds.add(node.blueprint.id);
  return matchedIds;
}

function entriesForNewMatches(
  state: GraphState,
  current: ReadonlySet<number>,
  previous: ReadonlySet<number>,
  rule: RuntimeRule,
): readonly RuleEntry[] {
  return [...state.nodes.values()]
    .filter(node => current.has(node.blueprint.id) && !previous.has(node.blueprint.id))
    .map(node => ({node, rule}));
}

function findRuleEntries(
  state: GraphState,
  candidates: ReadonlySet<RuntimeRule>,
): readonly RuleEntry[] {
  const entries: RuleEntry[] = [];
  for (const [rule, previous] of state.activeMatches) {
    if (!candidates.has(rule)) continue;
    const current = matchingNodeIds(state, rule.condition);
    entries.push(...entriesForNewMatches(state, current, previous, rule));
    state.activeMatches.set(rule, current);
  }
  return entries;
}

/**
 * [internal](internal)
 *
 * @since 0.1.0
 */
export const make = Effect.fn("CascadeRuntime.make")(function* (rules: readonly RuntimeRule[]) {
  const initial = initialState(rules);
  const state = yield* Ref.make(initial);
  const revision = yield* SubscriptionRef.make(0);
  const failurePubSub = yield* PubSub.unbounded<RuleFailure>();
  let runtime: RuntimeOperations;

  // Capture a rule's exit without adding engine stack frames to the domain failure.
  const captureRuleExit = Effect.fnUntraced(function* (entry: RuleEntry) {
    const token = runtime.handle(entry.node, entry.node.blueprint.definition.name, [] as const);
    const exit = yield* Effect.exit(Effect.gen(() => entry.rule.handler(token)));
    return {exit, token};
  });
  const runRule = (entry: RuleEntry): Effect.Effect<void> =>
    Effect.gen(function* () {
      const {exit, token} = yield* captureRuleExit(entry);
      if (Exit.isFailure(exit))
        yield* PubSub.publish(failurePubSub, {
          cause: withoutStackTrace(exit.cause),
          rule: entry.rule.name,
          token,
        });
    });

  const takePendingEntries = Ref.modify(state, current => {
    if (!current.pendingRuleScan) return [undefined, current] as const;
    current.pendingRuleScan = false;
    return [findRuleEntries(current, takeCandidateRules(current)), current] as const;
  });
  const completeDrain = Ref.modify(state, (current): readonly [DrainCompletion, GraphState] => {
    if (current.pendingRuleScan) return [{kind: "continue"}, current];
    const changed = current.changed;
    current.changed = false;
    current.draining = false;
    return [{changed, kind: "complete"}, current];
  });
  let drainRules: () => Effect.Effect<void>;
  const finishDrain = Effect.fn("CascadeRuntime.finishDrain")(function* () {
    const completion = yield* completeDrain;
    if (completion.kind === "continue") return yield* drainRules();
    if (completion.changed) yield* SubscriptionRef.update(revision, value => value + 1);
  });
  drainRules = Effect.fn("CascadeRuntime.drainRules")(function* () {
    const entries = yield* takePendingEntries;
    if (entries === undefined) return yield* finishDrain();
    yield* Effect.forEach(entries, runRule, {concurrency: 1, discard: true});
    return yield* drainRules();
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
  ): LiveNode | undefined =>
    [...node.outgoing.values(), ...node.incoming].find(candidate =>
      relatedNodeMatches(candidate, target),
    );
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
    const release = yield* Effect.cached(releaseRoots(mounted));
    return new MountImpl({
      changes: SubscriptionRef.changes(revision).pipe(Stream.map(() => undefined)),
      release,
      roots: mounted.map(node => handle(node, node.blueprint.definition.name, [] as const)),
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
  return runtime;
});
