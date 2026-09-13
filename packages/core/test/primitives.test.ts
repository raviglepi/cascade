import type {EventProperty} from "../src/index.ts";
import {describe, expect, it} from "@effect/vitest";

import {Effect} from "effect";

import {Element, Event, Style} from "../src/index.ts";

const elementEvent: EventProperty = "onClick";

describe("shared DOM token families", () => {
  it("exports representative element, style, and event definitions", () => {
    expect(Element.Div().definition).toBe(Element.Div);
    expect(Style.Color("navy").definition).toBe(Style.Color);
    expect(Event.OnClick(() => Effect.void).definition).toBe(Event.OnClick);
    expect(elementEvent).toBe("onClick");
  });
});
