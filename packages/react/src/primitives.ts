/** @since 0.1.0 */

import type {KeyboardEventHandler, MouseEventHandler} from "react";

import {Token} from "cascade";

/** @since 0.1.0 */
export interface ImageSource {
  readonly alt: string;
  readonly src: string;
}

/** @since 0.1.0 */
export type VisibilityValue = "collapse" | "hidden" | "visible";
/** @since 0.1.0 */
export type SpacingValue = number | string;

/** @since 0.1.0 */
export const Row = Token("Row")();
/** @since 0.1.0 */
export const Column = Token("Column")();
/** @since 0.1.0 */
export const Text = Token("Text")<string>();
/** @since 0.1.0 */
export const Image = Token("Image")<ImageSource>();
/** @since 0.1.0 */
export const ButtonElement = Token("ButtonElement")();

/** @since 0.1.0 */
export const Opacity = Token("Opacity")<number>();
/** @since 0.1.0 */
export const Color = Token("Color")<string>();
/** @since 0.1.0 */
export const Gap = Token("Gap")<SpacingValue>();
/** @since 0.1.0 */
export const Padding = Token("Padding")<SpacingValue>();
/** @since 0.1.0 */
export const Visibility = Token("Visibility")<VisibilityValue>();

/** @since 0.1.0 */
export const OnClick = Token("OnClick")<MouseEventHandler<HTMLElement>>();
/** @since 0.1.0 */
export const OnKeyDown = Token("OnKeyDown")<KeyboardEventHandler<HTMLElement>>();
