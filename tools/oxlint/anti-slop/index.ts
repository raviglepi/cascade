import {eslintCompatPlugin} from "@oxlint/plugins";

import {noChainedTypeAssertionsRule} from "./src/rules/no-chained-type-assertions.ts";
import {noConditionalEmptyObjectSpreadRule} from "./src/rules/no-conditional-empty-object-spread.ts";
import {noKnownValueWideningRule} from "./src/rules/no-known-value-widening.ts";
import {noModuleMockingRule} from "./src/rules/no-module-mocking.ts";
import {noObjectParametersRule} from "./src/rules/no-object-parameters.ts";
import {noReflectApplyRule} from "./src/rules/no-reflect-apply.ts";
import {noReflectGetRule} from "./src/rules/no-reflect-get.ts";
import {noRuntimeTypeofRule} from "./src/rules/no-runtime-typeof.ts";
import {noForbiddenTermInSymbolNamesRule} from "./src/rules/no-shape-in-symbol-names.ts";
import {noUnknownParametersRule} from "./src/rules/no-unknown-parameters.ts";
import {noUnknownReturnsRule} from "./src/rules/no-unknown-returns.ts";
import {noUnknownTypeAliasesRule} from "./src/rules/no-unknown-type-aliases.ts";
import {noUnsafeDictionaryTypeRule} from "./src/rules/no-unsafe-dictionary-type.ts";
import {noWidenThenAssertRule} from "./src/rules/no-widen-then-assert.ts";
import {requireSafetyCommentForTypeAssertionRule} from "./src/rules/require-safety-comment-for-type-assertion.ts";

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const antiSlopPlugin = eslintCompatPlugin({
  meta: {name: "anti-slop"},
  rules: {
    "no-chained-type-assertions": noChainedTypeAssertionsRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-known-value-widening": noKnownValueWideningRule,
    "no-module-mocking": noModuleMockingRule,
    "no-object-parameters": noObjectParametersRule,
    "no-reflect-apply": noReflectApplyRule,
    "no-reflect-get": noReflectGetRule,
    "no-runtime-typeof": noRuntimeTypeofRule,
    "no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
    "no-shape-in-symbol-names": noForbiddenTermInSymbolNamesRule,
    "no-unknown-parameters": noUnknownParametersRule,
    "no-unknown-returns": noUnknownReturnsRule,
    "no-unknown-type-aliases": noUnknownTypeAliasesRule,
    "no-widen-then-assert": noWidenThenAssertRule,
    "require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertionRule,
  },
});

export default antiSlopPlugin;
