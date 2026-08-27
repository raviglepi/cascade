import type {KeyboardEventHandler, MouseEventHandler} from "react";
import {Token} from "cascade";

export interface ImageSource {
  readonly alt: string;
  readonly src: string;
}

export type VisibilityValue = "collapse" | "hidden" | "visible";
export type SpacingValue = number | string;

export const Row = Token("Row")();
export const Column = Token("Column")();
export const Text = Token("Text")<string>();
export const Image = Token("Image")<ImageSource>();
export const ButtonElement = Token("ButtonElement")();

export const Opacity = Token("Opacity")<number>();
export const Color = Token("Color")<string>();
export const Gap = Token("Gap")<SpacingValue>();
export const Padding = Token("Padding")<SpacingValue>();
export const Visibility = Token("Visibility")<VisibilityValue>();

export const OnClick = Token("OnClick")<MouseEventHandler<HTMLElement>>();
export const OnKeyDown = Token("OnKeyDown")<KeyboardEventHandler<HTMLElement>>();
