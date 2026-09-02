import {describe, expect, it} from "vitest";

import * as Effect from "effect/Effect";
import {renderToStaticMarkup} from "react-dom/server";
import {Cascade} from "cascade";
import {createContactRow, ContactRules} from "../demo/contact-row.tsx";
import {createReactRenderer} from "../src/index.ts";

describe("React contact row", () => {
  it("projects semantic contact data and host styles", () => {
    const runtime = Effect.runSync(new Cascade().extend(ContactRules).gen());
    const reports: string[] = [];
    const renderer = createReactRenderer({
      reportError: report => reports.push(report.kind),
      runtime,
    });
    const html = renderToStaticMarkup(
      renderer.render(
        createContactRow({
          image: {alt: "Ada Lovelace", src: "/ada.png"},
          name: "Ada Lovelace",
          onSelect: () => undefined,
          preview: "The engine can compose music.",
          time: "09:42",
        }),
      ),
    );

    expect(html).toContain('<button type="button">');
    expect(html).toContain('<img alt="Ada Lovelace" src="/ada.png"/>');
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("The engine can compose music.");
    expect(html).toContain("09:42");
    expect(html).toContain("gap:12px");
    expect(html).toContain("padding:10px");
    expect(reports).toEqual([]);
  });

  it("removes only the preview in compact mode", () => {
    const runtime = Effect.runSync(new Cascade().extend(ContactRules).gen());
    const renderer = createReactRenderer({reportError: () => undefined, runtime});
    const html = renderToStaticMarkup(
      renderer.render(
        createContactRow({
          compact: true,
          image: {alt: "Grace Hopper", src: "/grace.png"},
          name: "Grace Hopper",
          onSelect: () => undefined,
          preview: "It's easier to ask forgiveness.",
          time: "10:15",
        }),
      ),
    );

    expect(html).toContain("Grace Hopper");
    expect(html).toContain("/grace.png");
    expect(html).toContain("10:15");
    expect(html).not.toContain("easier to ask forgiveness");
  });
});
