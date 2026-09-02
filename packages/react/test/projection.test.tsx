import {describe, expect, it} from "vitest";

import * as Effect from "effect/Effect";
import {renderToStaticMarkup} from "react-dom/server";
import {Cascade, Token} from "cascade";
import {Color, Column, Row, Text, createReactRenderer} from "../src/index.ts";

describe("React projection", () => {
  it("groups multiple hosts before applying a semantic decorator", () => {
    const Card = Token("Card")();
    const runtime = Effect.runSync(new Cascade().gen());
    const renderer = createReactRenderer({reportError: () => undefined, runtime});
    const html = renderToStaticMarkup(
      renderer.render(Card(Color("navy"), Row(Text("Primary")), Column(Text("Secondary")))),
    );

    expect(html).toContain('<div style="color:navy"><div style="display:flex');
    expect(html.match(/color:navy/g)).toHaveLength(1);
  });
});
