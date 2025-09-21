module.exports = {
  root: true,
  env: { es2023: true, node: true, jest: true, browser: false },
  parser: "@typescript-eslint/parser",
  parserOptions: { project: ["./tsconfig.json"], sourceType: "module" },
  plugins: ["@typescript-eslint", "import", "security", "jest"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:security/recommended",
    "plugin:jest/recommended",
    "prettier"
  ],
  rules: {
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        "groups": ["builtin", "external", "internal", ["parent", "sibling", "index"]],
        "alphabetize": { "order": "asc", "caseInsensitive": true }
      }
    ]
  }
};