import type {Effect as EffectType} from "effect";

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

/** @internal */
export type ReflectedTypeInfo = {
  readonly fields: readonly {
    readonly name: string;
    readonly optional?: boolean;
    readonly readonly?: boolean;
    readonly type: string;
  }[];
  readonly kind?: string;
  readonly name: string;
};

/** @internal */
export type TypeInfoError = Data.TaggedEnum<{
  readonly EmptyEnum: {readonly name: string};
  readonly InvalidField: {readonly field: string; readonly type: string; readonly typeName: string};
}>;

const TypeInfoError = Data.taggedEnum<TypeInfoError>();

/** @internal */
export class TypeInfoField extends Data.Class<{readonly name: string; readonly type: string}> {}

/** @internal */
class ManagedTypeInfo<Source> extends Data.Class<{
  readonly fields: readonly TypeInfoField[];
  readonly name: string;
}> {
  declare readonly Source: Source;
}

/** @internal */
export type TypeInfo<Source> = ManagedTypeInfo<Source>;

/**
 * Converts `typesugar` reflection output into immutable Cascade metadata.
 *
 * `typeInfo<T>()` is generated at compile time. This constructor still checks
 * the generated shape so the rest of the token generator works with a small,
 * typed domain model rather than loose reflection objects.
 *
 * @internal
 */
export const TypeInfo = <Source>(
  reflected: ReflectedTypeInfo,
): EffectType.Effect<TypeInfo<Source>, TypeInfoError> =>
  Effect.gen(function* () {
    const fields = yield* Effect.forEach(reflected.fields, field => {
      if (field.name.length === 0 || field.type.length === 0) {
        return Effect.fail(
          TypeInfoError.InvalidField({
            field: field.name,
            type: field.type,
            typeName: reflected.name,
          }),
        );
      }
      return Effect.succeed(new TypeInfoField({name: field.name, type: field.type}));
    });
    return new ManagedTypeInfo<Source>({fields, name: reflected.name});
  }).pipe(Effect.withSpan("CascadeReact.TypeInfo"));

/**
 * Builds validated enum metadata from a reflected `UnionToTuple` type.
 *
 * TypeScript exposes tuple members as numeric fields. `UnionToTuple` makes a
 * finite union visible to `typeInfo`, while this function ignores tuple helper
 * fields such as `length` and `concat`.
 *
 * @internal
 */
export const enumInfo = <Value extends string>(
  info: TypeInfo<readonly Value[]>,
): EffectType.Effect<EnumInfo<Value>, TypeInfoError> =>
  Effect.gen(function* () {
    const tupleFields = info.fields.filter(field => Number.isInteger(Number(field.name)));
    if (tupleFields.length === 0) {
      return yield* Effect.fail(TypeInfoError.EmptyEnum({name: info.name}));
    }
    const values = yield* Effect.forEach(tupleFields, field => {
      const literal = stringLiteral(field.type);
      return literal === undefined
        ? Effect.fail(
            TypeInfoError.InvalidField({field: field.name, type: field.type, typeName: info.name}),
          )
        : Effect.succeed(literal);
    });
    const ordered = [...values].sort();
    return new EnumInfo<Value>({name: info.name, values: ordered});
  }).pipe(Effect.withSpan("CascadeReact.TypeInfo.enumInfo"));

/** @internal */
export class EnumInfo<Value extends string> extends Data.Class<{
  readonly name: string;
  readonly values: readonly string[];
}> {
  declare readonly Value: Value;

  is(value: string): value is Value {
    return this.values.includes(value);
  }
}

function stringLiteral(type: string): string | undefined {
  const matched = /^(?:"([^"]*)"|'([^']*)')$/.exec(type);
  return matched?.[1] ?? matched?.[2];
}
