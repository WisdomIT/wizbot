import nextJsConfig from "@wizbot/eslint-config/next";

export default [
  ...nextJsConfig,
  {
    settings: {
      react: {
        version: "19.0.0",
      },
    },
  },
];
