import { defineRule, eslintCompatPlugin, type ESTree } from "@oxlint/plugins";

const EXACT_MATH_MEMBERS = new Set([
  "abs",
  "ceil",
  "floor",
  "imul",
  "max",
  "min",
  "round",
  "sign",
  "sqrt",
  "trunc",
]);

function exactMemberName(node: ESTree.IdentifierReference): string | null {
  const parent = node.parent;

  if (parent.type !== "MemberExpression" || parent.object !== node || parent.computed) {
    return null;
  }

  const property = parent.property;

  return property.type === "Identifier" && EXACT_MATH_MEMBERS.has(property.name)
    ? property.name
    : null;
}

const noInexactMathRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Math members and operators whose results differ between JavaScript engines.",
    },
    messages: {
      inexactMath:
        "Only exact Math members ({{allowed}}) may run in the deterministic engine. Rebuild this from + - * / and sqrt.",
      exponent:
        "`**` is implementation-approximated. Multiply explicitly so every engine agrees on the result.",
    },
  },
  createOnce(context) {
    return {
      Identifier(node) {
        if (node.name !== "Math" || !context.sourceCode.isGlobalReference(node)) {
          return;
        }

        if (exactMemberName(node) === null) {
          context.report({
            node: node.parent,
            messageId: "inexactMath",
            data: { allowed: [...EXACT_MATH_MEMBERS].join(", ") },
          });
        }
      },
      BinaryExpression(node) {
        if (node.operator === "**") {
          context.report({ node, messageId: "exponent" });
        }
      },
      AssignmentExpression(node) {
        if (node.operator === "**=") {
          context.report({ node, messageId: "exponent" });
        }
      },
    };
  },
});

const determinismPlugin = eslintCompatPlugin({
  meta: { name: "determinism" },
  rules: {
    "no-inexact-math": noInexactMathRule,
  },
});

export default determinismPlugin;
