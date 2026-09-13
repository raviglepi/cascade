import type {DOMAttributes} from "react";
import {describe, expect, it} from "vitest";

import {Effect} from "effect";

import {isValidElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Element, Event, Style, Token, Whuiy} from "whuiy";
import {createReactRenderer} from "../src/index.ts";
import {ListenerDispatcher, project} from "../src/projection.tsx";

describe("React projection", () => {
  it("reports an initial rule failure during static rendering", () => {
    const Item = Token("Item")();
    const Touched = Token("Touched")();
    const reportedRules: string[] = [];
    const runtime = Effect.runSync(
      new Whuiy()
        .rule(Item(), function* (item) {
          yield* item.pipe(Token.add(Touched()));
          throw new Error("initial rule failure");
        })
        .make(),
    );
    const renderer = createReactRenderer({
      reportError: report => {
        if (report.kind === "rule") reportedRules.push(report.failure.rule);
      },
      runtime,
    });

    renderToStaticMarkup(renderer.render(Item()));

    expect(reportedRules).toEqual(["Item.1"]);
  });

  it("groups native CSS decorators on a host", () => {
    const Card = Token("Card")();
    const runtime = Effect.runSync(new Whuiy().make());
    const renderer = createReactRenderer({reportError: () => undefined, runtime});
    const html = renderToStaticMarkup(
      renderer.render(Card(Style.Color("navy"), Style.Padding("1rem"), Element.Div())),
    );

    expect(html).toContain("color:navy");
    expect(html).toContain("padding:1rem");
    expect(html.match(/color:navy/g)).toHaveLength(1);
  });

  it("projects generated event decorators and skips absent listeners", () => {
    const runtime = Effect.runSync(new Whuiy().make());
    const mounted = Effect.runSync(
      runtime.mount(Element.Button(Event.OnClick(() => Effect.void)), Element.Button()),
    );

    const [handled, absent] = Effect.runSync(
      project({roots: mounted.roots}).pipe(
        Effect.provideService(
          ListenerDispatcher,
          ListenerDispatcher.of({dispatch: () => undefined, report: () => Effect.void}),
        ),
      ),
    );
    if (
      !isValidElement<DOMAttributes<HTMLElement>>(handled) ||
      !isValidElement<DOMAttributes<HTMLElement>>(absent)
    ) {
      Effect.runSync(mounted.release);
      throw new Error("Expected projected button elements");
    }

    expect(handled.props.onClick).toBeTypeOf("function");
    expect(absent.props.onClick).toBeUndefined();
    Effect.runSync(mounted.release);
  });
});
