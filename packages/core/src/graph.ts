/** @since 0.1.0 */

import type {CascadeEffect, WriteAddress} from "./operation.ts";
import type {RuntimeRule, RuleFailure, RuleFailureListener} from "./rules.ts";
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

import * as Effect from "effect/Effect";
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

/** @since 0.1.0 */
export interface MountedRoots {
  readonly roots: readonly LiveToken[];
  release(): void;
  snapshot(): number;
  subscribe(listener: () => void): () => void;
}

/** @since 0.1.0 */
export interface CascadeRuntime {
  mount(...roots: readonly TokenRoot[]): MountedRoots;
  onRuleFailure(listener: RuleFailureListener): () => void;
}

function makeOperation<Writes extends WriteAddress>(options: {
  readonly run: () => void;
  readonly writes: Writes;
}): CascadeEffect<void, Writes> {
  const effect = Object.assign(Effect.sync(options.run), {[OperationWritesId]: options.writes});
  // SAFETY: the iterator override is type-only; runtime iteration remains Effect's iterator.
  return effect as CascadeEffect<void, Writes>;
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
  readonly roots: readonly LiveToken[];
  readonly #runtime: CascadeRuntimeImpl;
  readonly #nodes: readonly LiveNode[];
  #released = false;

  constructor(options: {
    readonly nodes: readonly LiveNode[];
    readonly roots: readonly LiveToken[];
    readonly runtime: CascadeRuntimeImpl;
  }) {
    this.#nodes = options.nodes;
    this.roots = options.roots;
    this.#runtime = options.runtime;
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#runtime.releaseRoots(this.#nodes);
  }

  snapshot(): number {
    return this.#runtime.revision;
  }

  subscribe(listener: () => void): () => void {
    return this.#runtime.subscribe(listener);
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
  readonly #runtime: CascadeRuntimeImpl;

  constructor(options: {
    readonly node: LiveNode;
    readonly path: Path;
    readonly root: Root;
    readonly runtime: CascadeRuntimeImpl;
  }) {
    this.#node = options.node;
    this.#path = options.path;
    this.#root = options.root;
    this.#runtime = options.runtime;
    // SAFETY: handles retain the definition chosen by the typed construction path.
    this.definition = options.node.blueprint.definition as Definition;
    this.id = options.node.blueprint.id;
  }

  add<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>> {
    return makeOperation({
      run: () => this.#runtime.add(this.#node, terms),
      writes: {path: this.#path, root: this.#root, slot: {kind: "relations"}},
    });
  }

  del<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, RelationWrite<Terms, Root, Path>> {
    const names = terms.map(term => expandRoot(term).definition.name);
    // SAFETY: each joined name comes from one of the exact Terms definitions.
    const definition = names.join("|") as DefinitionName<DefinitionOf<ExpandAlias<Terms[number]>>>;
    const writes: RelationWrite<Terms, Root, Path> = {
      path: this.#path,
      root: this.#root,
      slot: {definition, kind: "relation"},
    };
    return makeOperation({run: () => this.#runtime.del(this.#node, terms), writes});
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
    if (node === undefined) {
      throw new Error(
        `Token ${this.definition.name}#${this.id} has no ${definition.name} relation`,
      );
    }
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
      run: () => this.#runtime.set(this.#node, terms),
      writes: {path: this.#path, root: this.#root, slot: {kind: "relations"}},
    });
  }

  setValue(
    value: ValueOf<Definition>,
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "value"}>> {
    return makeOperation({
      run: () => this.#runtime.setValue(this.#node, value),
      writes: {path: this.#path, root: this.#root, slot: {kind: "value"}},
    });
  }

  tokens(): readonly LiveToken[] {
    return [...this.#node.outgoing.values()].map(node =>
      this.#runtime.handle(node, this.#root, [...this.#path, node.blueprint.definition.name]),
    );
  }

  value(): ValueOf<Definition> | undefined {
    // SAFETY: the live node originates from a TokenInstance of Definition.
    return this.#node.valueState.kind === "present"
      ? (this.#node.valueState.value as ValueOf<Definition>)
      : undefined;
  }
}

/** @since 0.1.0 */
export class CascadeRuntimeImpl implements CascadeRuntime {
  readonly #activeMatches = new Map<RuntimeRule, Set<number>>();
  readonly #changedDefinitions = new Set<TokenDefinitionRef>();
  readonly #failureListeners = new Set<RuleFailureListener>();
  readonly #listeners = new Set<() => void>();
  readonly #negativeRules = new Set<RuntimeRule>();
  readonly #nodes = new Map<TokenInstanceRef, LiveNode>();
  readonly #rules: readonly RuntimeRule[];
  readonly #rulesByDefinition = new Map<TokenDefinitionRef, Set<RuntimeRule>>();
  #changed = false;
  #draining = false;
  #pendingRuleScan = false;
  revision = 0;

  constructor(rules: readonly RuntimeRule[]) {
    this.#rules = rules;
    for (const rule of rules) {
      this.#activeMatches.set(rule, new Set());
      const positives = new Set<TokenDefinitionRef>();
      collectPositiveDefinitions(rule.condition, positives);
      this.indexRule(rule.condition.definition, rule);
      if (positives.size === 0 && getDetachedNegativeDefinitions(rule.condition).length > 0) {
        this.#negativeRules.add(rule);
      } else if (positives.size > 0) {
        for (const definition of positives) this.indexRule(definition, rule);
      }
    }
  }

  add(node: LiveNode, roots: readonly TokenRoot[]): void {
    this.change(() => {
      for (const root of roots) this.mergeRelation(node, expandRoot(root));
    });
  }

  del(node: LiveNode, roots: readonly TokenRoot[]): void {
    this.change(() => {
      for (const root of roots) this.removeRelation(node, expandRoot(root).definition);
    });
  }

  findRelated(node: LiveNode, target: TokenDefinitionRef | TokenInstanceRef): LiveNode | undefined {
    const definition = isTokenDefinition(target) ? target : target.definition;
    const direct = node.outgoing.get(definition);
    if (direct !== undefined && (isTokenDefinition(target) || this.matches(direct, target))) {
      return direct;
    }
    for (const incoming of node.incoming) {
      if (
        incoming.blueprint.definition === definition &&
        (isTokenDefinition(target) || this.matches(incoming, target))
      ) {
        return incoming;
      }
    }
    return undefined;
  }

  handle<Root extends string, Path extends readonly string[]>(
    node: LiveNode,
    root: Root,
    path: Path,
  ): LiveToken<TokenDefinitionRef, Root, Path> {
    return new LiveTokenImpl({node, path, root, runtime: this});
  }

  mount(...roots: readonly TokenRoot[]): MountedRoots {
    const nodes: LiveNode[] = [];
    this.change(() => {
      for (const root of roots) {
        const node = this.mountNode(expandRoot(root));
        node.rootReferences += 1;
        nodes.push(node);
      }
    });
    const handles = nodes.map(node =>
      this.handle(node, node.blueprint.definition.name, [] as const),
    );
    return new MountedRootsImpl({nodes, roots: handles, runtime: this});
  }

  onRuleFailure(listener: RuleFailureListener): () => void {
    this.#failureListeners.add(listener);
    return () => this.#failureListeners.delete(listener);
  }

  releaseRoots(nodes: readonly LiveNode[]): void {
    this.change(() => {
      for (const node of nodes) {
        node.rootReferences -= 1;
        this.removeIfOrphaned(node);
      }
    });
  }

  set(node: LiveNode, roots: readonly TokenRoot[]): void {
    this.change(() => {
      for (const definition of node.outgoing.keys()) {
        this.removeRelation(node, definition);
      }
      for (const root of roots) this.mergeRelation(node, expandRoot(root));
    });
  }

  setValue(node: LiveNode, value: TokenValue): void {
    this.change(() => {
      node.valueState = {kind: "present", value};
      this.markChanged(node.blueprint.definition);
    });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private change(action: () => void): void {
    action();
    this.#changed = true;
    this.#pendingRuleScan = true;
    if (this.#draining) return;
    this.drainRules();
    if (!this.#changed) return;
    this.#changed = false;
    this.revision += 1;
    for (const listener of this.#listeners) listener();
  }

  private drainRules(): void {
    this.#draining = true;
    try {
      while (this.#pendingRuleScan) {
        this.#pendingRuleScan = false;
        const entries = this.findRuleEntries(this.takeCandidateRules());
        for (const entry of entries) this.runRule(entry.rule, entry.node);
      }
    } finally {
      this.#draining = false;
    }
  }

  private findRuleEntries(
    candidates: ReadonlySet<RuntimeRule>,
  ): readonly {readonly node: LiveNode; readonly rule: RuntimeRule}[] {
    const entries: {readonly node: LiveNode; readonly rule: RuntimeRule}[] = [];
    for (const rule of this.#rules) {
      if (!candidates.has(rule)) continue;
      const previous = this.#activeMatches.get(rule);
      if (previous === undefined) continue;
      const current = new Set<number>();
      for (const node of this.#nodes.values()) {
        if (!this.matches(node, rule.condition)) continue;
        current.add(node.blueprint.id);
        if (!previous.has(node.blueprint.id)) entries.push({node, rule});
      }
      this.#activeMatches.set(rule, current);
    }
    return entries;
  }

  private indexRule(definition: TokenDefinitionRef, rule: RuntimeRule): void {
    const indexed = this.#rulesByDefinition.get(definition);
    if (indexed === undefined) {
      this.#rulesByDefinition.set(definition, new Set([rule]));
    } else {
      indexed.add(rule);
    }
  }

  private markChanged(definition: TokenDefinitionRef): void {
    this.#changedDefinitions.add(definition);
  }

  private matches(node: LiveNode, pattern: TokenInstanceRef): boolean {
    if (node.blueprint.definition !== pattern.definition) return false;
    const patternValue = getDetachedValue(pattern);
    if (
      patternValue.kind === "present" &&
      (node.valueState.kind === "absent" || !Object.is(node.valueState.value, patternValue.value))
    ) {
      return false;
    }
    const neighbours = [...node.outgoing.values(), ...node.incoming];
    for (const negative of getDetachedNegativeDefinitions(pattern)) {
      if (neighbours.some(neighbour => neighbour.blueprint.definition === negative)) {
        return false;
      }
    }
    for (const relation of getDetachedRelations(pattern)) {
      if (!neighbours.some(neighbour => this.matches(neighbour, relation))) return false;
    }
    return true;
  }

  private mergeRelation(owner: LiveNode, blueprint: TokenInstanceRef): void {
    this.markChanged(owner.blueprint.definition);
    this.markChanged(blueprint.definition);
    for (const [definition] of owner.outgoing) {
      if (
        definition !== blueprint.definition &&
        definitionsConflict(definition, blueprint.definition)
      ) {
        this.removeRelation(owner, definition);
      }
    }
    const existing = owner.outgoing.get(blueprint.definition);
    if (existing?.blueprint === blueprint) return;
    if (existing !== undefined) this.detach(owner, existing);
    const target = this.mountNode(blueprint);
    owner.outgoing.set(blueprint.definition, target);
    target.incoming.add(owner);
  }

  private mountNode(blueprint: TokenInstanceRef): LiveNode {
    const mounted = this.#nodes.get(blueprint);
    if (mounted !== undefined) return mounted;
    const node: LiveNode = {
      blueprint,
      incoming: new Set(),
      outgoing: new Map(),
      rootReferences: 0,
      valueState: getDetachedValue(blueprint),
    };
    this.#nodes.set(blueprint, node);
    this.markChanged(blueprint.definition);
    for (const relation of getDetachedRelations(blueprint)) {
      const target = this.mountNode(relation);
      node.outgoing.set(relation.definition, target);
      target.incoming.add(node);
    }
    return node;
  }

  private removeIfOrphaned(node: LiveNode): void {
    if (node.rootReferences > 0 || node.incoming.size > 0) return;
    this.#nodes.delete(node.blueprint);
    this.markChanged(node.blueprint.definition);
    for (const target of node.outgoing.values()) {
      target.incoming.delete(node);
      this.removeIfOrphaned(target);
    }
    node.outgoing.clear();
  }

  private removeRelation(owner: LiveNode, definition: TokenDefinitionRef): void {
    const target = owner.outgoing.get(definition);
    if (target === undefined) return;
    owner.outgoing.delete(definition);
    this.markChanged(owner.blueprint.definition);
    this.markChanged(target.blueprint.definition);
    this.detach(owner, target);
  }

  private detach(owner: LiveNode, target: LiveNode): void {
    target.incoming.delete(owner);
    this.removeIfOrphaned(target);
  }

  private takeCandidateRules(): ReadonlySet<RuntimeRule> {
    const candidates = new Set(this.#negativeRules);
    for (const definition of this.#changedDefinitions) {
      const indexed = this.#rulesByDefinition.get(definition);
      if (indexed === undefined) continue;
      for (const rule of indexed) candidates.add(rule);
    }
    this.#changedDefinitions.clear();
    return candidates;
  }

  private runRule(rule: RuntimeRule, node: LiveNode): void {
    const token = this.handle(node, node.blueprint.definition.name, [] as const);
    try {
      Effect.runSync(Effect.gen(() => rule.handler(token)));
    } catch (cause) {
      const failure: RuleFailure = {cause, rule: rule.name, token};
      for (const listener of this.#failureListeners) listener(failure);
    }
  }
}
