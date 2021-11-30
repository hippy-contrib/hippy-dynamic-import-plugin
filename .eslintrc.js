module.exports = {
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaFeatures: {
      legacyDecorators: true,
      experimentalObjectRestSpread: true,
    },
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  extends: [
    'eslint-config-tencent',
    'plugin:import/recommended',
  ],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        // Allow interface export
        'no-undef': 'off',
        // Note you must disable the base rule as it can report incorrect errors
        'no-unused-vars': 'off',
      },
    },
  ],
  globals: {
    __PLATFORM__: 'readonly',
    __GLOBAL__: 'readonly',
    Hippy: 'readonly',
    WebSocket: 'readonly',
  },
  rules: {
    semi: ['error', 'always'],
    // Allow import from devDependencies
    'import/no-extraneous-dependencies': 'off',
    // Auto range order of imported module
    'import/order': ['error'],
    // Allow global underscore in dangle
    'no-underscore-dangle': [
      'warn',
      {
        allow: [
          '__ISHIPPY__',
          '__GLOBAL__',
          '__HIPPYNATIVEGLOBAL__',
          '__instanceId__',
        ],
      },
    ],
  },
};