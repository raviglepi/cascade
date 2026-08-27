import type {CascadeEffect, WriteAddress} from "./operation.ts";

const definitions = new WeakSet<object>();
const instances = new WeakSet<object>();
const aliases = new WeakSet<object>();
const exclusions = new WeakSet<object>();

let nextTokenId = 1;

export const TokenDefinitionId: unique symbol = Symbol("cascade.token.definition");
export const TokenInstanceId: unique symbol = Symbol("cascade.token.instance");
export const TokenAliasId: unique symbol = Symbol("cascade.token.alias");
export const NotTermId: unique symbol = Symbol("cascade.token.not");

export type TokenValue = bigint | boolean | null | number | object | string | symbol | undefined;

export interface TokenDefinitionRef {
  readonly excludedDefinitions: readonly TokenDefinitionRef[];
  readonly name: string;
  readonly [TokenDefinitionId]: {
    readonly defaults: () => TokenDefinitionRef;
    readonly excludes: () => TokenDefinitionRef;
    readonly value: () => TokenValue;
  };
}

export type TokenValueState =
  | {readonly kind: "absent"}
  | {readonly kind: "present"; readonly value: TokenValue};

export interface TokenInstanceRef {
  readonly definition: TokenDefinitionRef;
  readonly id: number;
  readonly negativeDefinitions: readonly TokenDefinitionRef[];
  readonly relations: readonly TokenInstanceRef[];
  readonly valueState: TokenValueState;
  hasValue(): boolean;
  tokens(): readonly TokenInstanceRef[];
  value(): TokenValue;
  readonly [TokenInstanceId]: {
    readonly definition: TokenDefinitionRef;
    readonly hasValue: boolean;
    readonly negative: TokenDefinitionRef;
    readonly positive: TokenDefinitionRef;
  };
}

export interface NotTerm<Definition extends TokenDefinitionRef = TokenDefinitionRef> {
  readonly definition: Definition;
  readonly [NotTermId]: Definition;
}

export interface TokenAlias<Instance extends TokenInstanceRef = TokenInstanceRef> {
  readonly instance: Instance;
  readonly [TokenAliasId]: Instance;
}

export type TokenTerm = TokenInstanceRef | TokenAlias | NotTerm;
export type TokenRoot = TokenInstanceRef | TokenAlias;

export type DefinitionOf<Instance extends TokenInstanceRef> =
  Instance[typeof TokenInstanceId]["definition"];

export type DefinitionName<Definition extends TokenDefinitionRef> = Definition["name"];

export type ValueOf<Definition extends TokenDefinitionRef> = ReturnType<
  Definition[typeof TokenDefinitionId]["value"]
>;

export type PositiveOf<Instance extends TokenInstanceRef> =
  Instance[typeof TokenInstanceId]["positive"];

export type NegativeOf<Instance extends TokenInstanceRef> =
  Instance[typeof TokenInstanceId]["negative"];

export type ExcludedBy<Definition extends TokenDefinitionRef> = ReturnType<
  Definition[typeof TokenDefinitionId]["excludes"]
>;

export type ExpandAlias<Term> = Term extends TokenAlias<infer Instance> ? Instance : Term;

type PositiveDefinitions<Terms extends readonly TokenTerm[]> =
  ExpandAlias<Terms[number]> extends infer Term
    ? Term extends TokenInstanceRef
      ? DefinitionOf<Term>
      : never
    : never;

type NegativeDefinitions<Terms extends readonly TokenTerm[]> = Terms[number] extends infer Term
  ? Term extends NotTerm<infer Definition>
    ? Definition
    : never
  : never;

type Names<Definition extends TokenDefinitionRef> = Definition extends TokenDefinitionRef
  ? DefinitionName<Definition>
  : never;

type ExcludedNames<Definition extends TokenDefinitionRef> = Definition extends TokenDefinitionRef
  ? Names<ExcludedBy<Definition>>
  : never;

type CompositionConflict<
  Existing extends TokenDefinitionRef,
  Terms extends readonly TokenTerm[],
> = Extract<
  Names<Existing | PositiveDefinitions<Terms>>,
  Names<NegativeDefinitions<Terms>> | ExcludedNames<Existing | PositiveDefinitions<Terms>>
>;

type TermDefinition<Term> =
  ExpandAlias<Term> extends infer Expanded
    ? Expanded extends TokenInstanceRef
      ? DefinitionOf<Expanded>
      : never
    : never;

type DuplicateNames<
  Terms extends readonly TokenTerm[],
  Seen extends string = never,
> = Terms extends readonly [infer First, ...infer Rest extends readonly TokenTerm[]]
  ? First extends NotTerm
    ? DuplicateNames<Rest, Seen>
    : Names<TermDefinition<First>> extends infer Name extends string
      ? Name extends Seen
        ? Name
        : DuplicateNames<Rest, Seen | Name>
      : never
  : never;

type CompositionProblem<Existing extends TokenDefinitionRef, Terms extends readonly TokenTerm[]> =
  | CompositionConflict<Existing, Terms>
  | DuplicateNames<Terms>;

type ValidateComposition<
  Existing extends TokenDefinitionRef,
  Terms extends readonly TokenTerm[],
> = [CompositionProblem<Existing, Terms>] extends [never]
  ? Terms
  : Terms & {readonly "Cascade composition conflict": CompositionProblem<Existing, Terms>};

export interface TokenInstance<
  Definition extends TokenDefinitionRef = TokenDefinitionRef,
  Positive extends TokenDefinitionRef = never,
  Negative extends TokenDefinitionRef = never,
  HasValue extends boolean = boolean,
> extends TokenInstanceRef {
  readonly definition: Definition;
  readonly [TokenInstanceId]: {
    readonly definition: Definition;
    readonly hasValue: HasValue;
    readonly negative: Negative;
    readonly positive: Positive;
  };
  hasValue(): HasValue;
  tokens(): readonly TokenInstanceRef[];
  value(): ValueOf<Definition> | undefined;
}

export interface TokenDefinition<
  Name extends string = string,
  Value extends TokenValue = never,
  Defaults extends TokenDefinitionRef = never,
  Excludes extends TokenDefinitionRef = never,
> extends TokenDefinitionRef {
  readonly excludedDefinitions: readonly TokenDefinitionRef[];
  readonly name: Name;
  readonly [TokenDefinitionId]: {
    readonly defaults: () => Defaults;
    readonly excludes: () => Excludes;
    readonly value: () => Value;
  };
  (): TokenInstance<this, Defaults, Excludes, false>;
  <const Terms extends readonly TokenTerm[]>(
    ...terms: ValidateComposition<Defaults, Terms>
  ): TokenInstance<
    this,
    Defaults | PositiveDefinitions<Terms>,
    Excludes | NegativeDefinitions<Terms>,
    false
  >;
  <const Terms extends readonly TokenTerm[]>(
    value: [Value] extends [never] ? never : Value,
    ...terms: ValidateComposition<Defaults, Terms>
  ): TokenInstance<
    this,
    Defaults | PositiveDefinitions<Terms>,
    Excludes | NegativeDefinitions<Terms>,
    true
  >;
}

interface TokenDeclaration<Name extends string, Value extends TokenValue> {
  <
    NextValue extends (never extends Value ? TokenValue : Value) = Value,
    const Defaults extends readonly TokenTerm[] = [],
  >(
    ...defaults: [] extends Defaults ? readonly TokenTerm[] : ValidateComposition<never, Defaults>
  ): TokenDefinition<Name, NextValue, PositiveDefinitions<Defaults>, NegativeDefinitions<Defaults>>;
  of<NextValue extends TokenValue>(): TokenDeclaration<Name, NextValue>;
}

export interface LiveToken<
  Definition extends TokenDefinitionRef = TokenDefinitionRef,
  Root extends string = string,
  Path extends readonly string[] = readonly string[],
> {
  readonly definition: Definition;
  readonly id: number;
  add<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>>;
  del<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<
    void,
    WriteAddress<
      Root,
      Path,
      {
        readonly definition: DefinitionName<DefinitionOf<ExpandAlias<Terms[number]>>>;
        readonly kind: "relation";
      }
    >
  >;
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
  hasValue(): boolean;
  pipe<Result>(operation: (token: this) => Result): Result;
  set<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>>;
  setValue(
    value: ValueOf<Definition>,
  ): CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "value"}>>;
  tokens(): readonly LiveToken[];
  value(): ValueOf<Definition> | undefined;
}

export interface TokenFactory {
  <Value extends TokenValue = never, const Name extends string = string>(
    name: Name,
  ): TokenDeclaration<Name, Value>;
  add<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): <Definition extends TokenDefinitionRef, Root extends string, Path extends readonly string[]>(
    token: LiveToken<Definition, Root, Path>,
  ) => CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>>;
  del<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): <Definition extends TokenDefinitionRef, Root extends string, Path extends readonly string[]>(
    token: LiveToken<Definition, Root, Path>,
  ) => CascadeEffect<
    void,
    WriteAddress<
      Root,
      Path,
      {
        readonly definition: DefinitionName<DefinitionOf<ExpandAlias<Terms[number]>>>;
        readonly kind: "relation";
      }
    >
  >;
  set<const Terms extends readonly TokenRoot[]>(
    ...terms: Terms
  ): <Definition extends TokenDefinitionRef, Root extends string, Path extends readonly string[]>(
    token: LiveToken<Definition, Root, Path>,
  ) => CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "relations"}>>;
  setValue<Value extends TokenValue>(
    value: Value,
  ): <Definition extends TokenDefinitionRef, Root extends string, Path extends readonly string[]>(
    token: LiveToken<Definition, Root, Path> &
      ([Value] extends [ValueOf<Definition>] ? object : never),
  ) => CascadeEffect<void, WriteAddress<Root, Path, {readonly kind: "value"}>>;
}

class DetachedToken implements TokenInstanceRef {
  readonly definition: TokenDefinitionRef;
  readonly id: number;
  readonly [TokenInstanceId]: {
    readonly definition: TokenDefinitionRef;
    readonly hasValue: boolean;
    readonly negative: TokenDefinitionRef;
    readonly positive: TokenDefinitionRef;
  };
  readonly negativeDefinitions: readonly TokenDefinitionRef[];
  readonly relations: readonly TokenInstanceRef[];
  readonly valueState: TokenValueState;

  constructor(options: {
    readonly definition: TokenDefinitionRef;
    readonly negativeDefinitions: readonly TokenDefinitionRef[];
    readonly relations: readonly TokenInstanceRef[];
    readonly valueState: TokenValueState;
  }) {
    this.definition = options.definition;
    this.id = nextTokenId;
    nextTokenId += 1;
    this.negativeDefinitions = options.negativeDefinitions;
    this.relations = options.relations;
    this.valueState = options.valueState;
    this[TokenInstanceId] = {
      definition: options.definition,
      hasValue: options.valueState.kind === "present",
      negative: options.definition,
      positive: options.definition,
    };
    instances.add(this);
  }

  hasValue(): boolean {
    return this.valueState.kind === "present";
  }

  tokens(): readonly TokenInstanceRef[] {
    return this.relations;
  }

  value(): TokenValue {
    return this.valueState.kind === "present" ? this.valueState.value : undefined;
  }
}

class RuntimeNotTerm<Definition extends TokenDefinitionRef> implements NotTerm<Definition> {
  readonly definition: Definition;
  readonly [NotTermId]: Definition;

  constructor(definition: Definition) {
    this.definition = definition;
    this[NotTermId] = definition;
    exclusions.add(this);
  }
}

class RuntimeAlias<Instance extends TokenInstanceRef> implements TokenAlias<Instance> {
  readonly instance: Instance;
  readonly [TokenAliasId]: Instance;

  constructor(instance: Instance) {
    this.instance = instance;
    this[TokenAliasId] = instance;
    aliases.add(this);
  }
}

function isInstance(value: TokenTerm): value is TokenInstanceRef {
  return instances.has(Object(value));
}

export function isTokenDefinition(
  value: TokenDefinitionRef | TokenInstanceRef,
): value is TokenDefinitionRef {
  return definitions.has(Object(value));
}

export function isTokenInstance(value: TokenTerm): value is TokenInstanceRef {
  return isInstance(value);
}

function isAlias(value: TokenTerm): value is TokenAlias {
  return aliases.has(Object(value));
}

function isNotTerm(value: TokenTerm): value is NotTerm {
  return exclusions.has(Object(value));
}

function cloneInstance(instance: TokenInstanceRef): TokenInstanceRef {
  const relations = instance.relations.map(cloneInstance);
  const valueState: TokenValueState =
    instance.valueState.kind === "present"
      ? {kind: "present", value: instance.valueState.value}
      : {kind: "absent"};
  return new DetachedToken({
    definition: instance.definition,
    negativeDefinitions: instance.negativeDefinitions,
    relations,
    valueState,
  });
}

export function expandRoot(root: TokenRoot): TokenInstanceRef {
  return isAlias(root) ? cloneInstance(root.instance) : root;
}

function cloneTerm(term: TokenTerm): TokenTerm {
  if (isAlias(term)) return cloneInstance(term.instance);
  if (isInstance(term)) return cloneInstance(term);
  return new RuntimeNotTerm(term.definition);
}

function definitionsConflict(left: TokenDefinitionRef, right: TokenDefinitionRef): boolean {
  return left.excludedDefinitions.includes(right) || right.excludedDefinitions.includes(left);
}

interface NormalizedTerms {
  readonly negatives: readonly TokenDefinitionRef[];
  readonly relations: readonly TokenInstanceRef[];
}

function normalizeTerms(terms: readonly TokenTerm[]): NormalizedTerms {
  const negatives: TokenDefinitionRef[] = [];
  const relations: TokenInstanceRef[] = [];
  for (const term of terms) {
    if (isNotTerm(term)) {
      if (!negatives.includes(term.definition)) negatives.push(term.definition);
      continue;
    }
    const incoming = isAlias(term) ? cloneInstance(term.instance) : term;
    const retained = relations.filter(
      existing =>
        existing.definition !== incoming.definition &&
        !definitionsConflict(existing.definition, incoming.definition),
    );
    retained.push(incoming);
    relations.splice(0, relations.length, ...retained);
  }
  return {negatives, relations};
}

function makeDefinition<Name extends string, Value extends TokenValue>(
  name: Name,
  defaults: readonly TokenTerm[],
): TokenDefinition<Name, Value, TokenDefinitionRef, TokenDefinitionRef> {
  const normalizedDefaults = normalizeTerms(defaults);
  let definition: TokenDefinitionRef;
  const declaration = (...input: readonly (TokenTerm | Value)[]) => {
    const relationInput: TokenTerm[] = [];
    let valueState: TokenValueState = {kind: "absent"};
    for (const [index, item] of input.entries()) {
      if (index === 0 && !isTokenTerm(item)) {
        valueState = {kind: "present", value: item};
      } else if (isTokenTerm(item)) {
        relationInput.push(item);
      }
    }
    const normalized = normalizeTerms([...defaults.map(cloneTerm), ...relationInput]);
    return new DetachedToken({
      definition,
      negativeDefinitions: normalized.negatives,
      relations: normalized.relations,
      valueState,
    });
  };
  Object.defineProperty(declaration, "name", {configurable: true, value: name});
  const phantomDefinition = (): TokenDefinitionRef => {
    throw new Error("Cascade token type metadata is not available at runtime");
  };
  const phantomValue = (): Value => {
    throw new Error("Cascade token type metadata is not available at runtime");
  };
  const callable = Object.assign(declaration, {
    [TokenDefinitionId]: {
      defaults: phantomDefinition,
      excludes: phantomDefinition,
      value: phantomValue,
    },
    cloneDefaults: () => defaults.map(cloneTerm),
    excludedDefinitions: normalizedDefaults.negatives,
  });
  definition = callable;
  definitions.add(callable);
  // @ts-expect-error SAFETY: the callable parser enforces the public value-first overload at runtime.
  return callable as TokenDefinition<Name, Value, TokenDefinitionRef, TokenDefinitionRef>;
}

function isTokenTerm<Value>(value: TokenTerm | Value): value is TokenTerm {
  const boxed = Object(value);
  return instances.has(boxed) || aliases.has(boxed) || exclusions.has(boxed);
}

function createDeclaration<Name extends string, Value extends TokenValue>(
  name: Name,
): TokenDeclaration<Name, Value> {
  const declaration = (...defaults: readonly TokenTerm[]) =>
    makeDefinition<Name, Value>(name, defaults);
  declaration.of = <NextValue extends TokenValue>() => createDeclaration<Name, NextValue>(name);
  // SAFETY: declaration forwards its complete relation tuple to makeDefinition unchanged.
  return declaration as TokenDeclaration<Name, Value>;
}

// SAFETY: createDeclaration implements the value-generic and literal-name callable contract.
const createToken = (<Value extends TokenValue = never, const Name extends string = string>(
  name: Name,
) => createDeclaration<Name, Value>(name)) as TokenFactory;

createToken.add =
  (...terms) =>
  token =>
    token.add(...terms);
createToken.del =
  (...terms) =>
  token =>
    token.del(...terms);
createToken.set =
  (...terms) =>
  token =>
    token.set(...terms);
function setValuePipe<Value extends TokenValue>(
  value: Value,
): ReturnType<TokenFactory["setValue"]> {
  return <
    Definition extends TokenDefinitionRef,
    Root extends string,
    Path extends readonly string[],
  >(
    token: LiveToken<Definition, Root, Path> &
      ([Value] extends [ValueOf<Definition>] ? object : never),
  ) => {
    // SAFETY: the conditional token parameter proves Value is valid for Definition.
    return token.setValue(value as ValueOf<Definition>);
  };
}

createToken.setValue = setValuePipe;

export const Token: TokenFactory = createToken;

export function Not<const Instance extends TokenInstanceRef>(
  instance: Instance,
): NotTerm<DefinitionOf<Instance>> {
  return new RuntimeNotTerm(instance.definition);
}

export function Alias<const Instance extends TokenInstanceRef>(
  instance: Instance,
): TokenAlias<Instance> {
  return new RuntimeAlias(instance);
}

export function getDetachedNegativeDefinitions(
  instance: TokenInstanceRef,
): readonly TokenDefinitionRef[] {
  return instance.negativeDefinitions;
}

export function getDetachedRelations(instance: TokenInstanceRef): readonly TokenInstanceRef[] {
  return instance.relations;
}

export function getDetachedValue(instance: TokenInstanceRef): TokenValueState {
  return instance.valueState;
}
