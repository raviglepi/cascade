import type {TokenInstanceRef} from "cascade";
import type {ImageSource} from "../src/index.ts";

import {Rule, Rules, Token} from "cascade";
import {Column, Element, Event, Image, Listener, Row, Size, Style, Text} from "../src/index.ts";

export interface ContactRowInput {
  readonly compact?: boolean;
  readonly image: ImageSource;
  readonly name: string;
  readonly onSelect: () => void;
  readonly preview: string;
  readonly time: string;
}

export const Compact = Token("Compact")();
export const Contact = Token("Contact")();
export const Avatar = Token("Avatar")<ImageSource>(Image());
export const ContactDetails = Token("ContactDetails")();
export const ContactName = Token("ContactName")<string>(Text());
export const ChatPreview = Token("ChatPreview")<string>(Text());
export const LastSeen = Token("LastSeen")<string>(Text());

export const ContactRules = Rules({
  contact: {
    compact: Rule(Contact(Compact()), function* (contact) {
      const column = contact.get(Element.Button).get(Row).get(ContactDetails).get(Column);
      yield* column.pipe(Token.del(ChatPreview()));
    }),
  },
});

export function createContactRow(input: ContactRowInput): TokenInstanceRef {
  const variant = input.compact === true ? [Compact()] : [];
  return Contact(
    ...variant,
    Event.OnClick(Listener(input.onSelect)),
    Element.Button(
      Row(
        Avatar(input.image),
        ContactDetails(
          Column(ContactName(input.name), ChatPreview(input.preview), Style.Gap(Size.Rm(2))),
        ),
        LastSeen(input.time),
        Style.Gap(Size.Rm(12)),
        Style.Padding(Size.Rm(10)),
      ),
    ),
  );
}
