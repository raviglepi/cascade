import {describe, expect, it} from "vitest";

import {Deferred, Effect, Exit, Scope} from "effect";

import {makeListenerDispatcher} from "../src/renderer.tsx";

describe("React renderer resources", () => {
  it("interrupts listener effects when their projection scope closes", () => {
    const started = Deferred.makeUnsafe<void>();
    const interrupted = Deferred.makeUnsafe<void>();
    const scope = Scope.makeUnsafe();
    const dispatcher = makeListenerDispatcher(() => undefined, scope);

    return Effect.gen(function* () {
      dispatcher.dispatch(
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(
            Effect.never.pipe(Effect.ensuring(Deferred.succeed(interrupted, undefined))),
          ),
        ),
      );

      yield* Deferred.await(started);
      yield* Scope.close(scope, Exit.void);
      yield* Deferred.await(interrupted);

      expect(scope.state._tag).toBe("Closed");
    }).pipe(Effect.runPromise);
  });
});
