import type {RuleFailure} from "whuiy";

/** @since 0.4.0 */
export type WhuiyDomReport =
  | {readonly cause: unknown; readonly kind: "listener"; readonly tokenId: number}
  | {readonly cause: unknown; readonly kind: "projection"; readonly tokenId?: number}
  | {readonly failure: RuleFailure; readonly kind: "rule"};

/** @since 0.4.0 */
export type ErrorReporter = (report: WhuiyDomReport) => void;

/** @since 0.4.0 */
export class ProjectionError {
  readonly cause: unknown;
  readonly message = "Whuiy could not project this token graph";
  readonly tokenId?: number;

  constructor(options: {readonly cause: unknown; readonly tokenId?: number}) {
    this.cause = options.cause;
    if (options.tokenId !== undefined) this.tokenId = options.tokenId;
  }
}
