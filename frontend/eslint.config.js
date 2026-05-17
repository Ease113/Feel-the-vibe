import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": ["error", {
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
        },
        publicOnly: true,
      }],
      "jsdoc/require-description": "error",
    },
  }
);
