module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // Security Rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'error',
    'no-debugger': 'error',

    // Code Quality Rules
    'no-unused-vars': 'off',
    'no-console': ['warn', { 'allow': ['warn', 'error'] }],
    'no-undef': 'off',
    'prefer-const': 'error',
    'no-var': 'error',

    // Style Rules
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { 'avoidEscape': true }],
    'indent': ['error', 2],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'comma-dangle': ['error', 'always-multiline'],
    'brace-style': ['error', '1tbs'],
    'max-len': ['error', {
      'code': 100,
      'ignoreUrls': true,
      'ignoreStrings': true,
      'ignoreTemplateLiterals': true,
      'ignoreRegExpLiterals': true
    }],

    // Best Practices
    'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
    'no-sequences': 'error',
    'no-unused-expressions': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'no-useless-return': 'error',
    'radix': 'error',
    'no-iterator': 'error',
    'no-loop-func': 'error',
    'no-multi-str': 'error',
    'no-new': 'error',
    'no-new-wrappers': 'error',
    'no-proto': 'error',
    'no-redeclare': 'error',
    'no-return-assign': 'error',
    'no-return-await': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-useless-escape': 'error',
    'no-global-assign': 'error',

    // Complexity Rules
    'complexity': ['error', 10],
    'max-depth': ['error', 4],
    'max-nested-callbacks': ['error', 3],
    'max-params': ['error', 5],
    'max-statements': ['error', 25],

    // TypeScript-specific rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/no-unnecessary-type-assertion': 'error',
    '@typescript-eslint/no-empty-interface': 'error',
    '@typescript-eslint/prefer-promise-reject-errors': 'error',
    '@typescript-eslint/no-require-imports': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-for-in-array': 'error',
    '@typescript-eslint/no-throw-literal': 'error',
    '@typescript-eslint/prefer-string-starts-ends-with': 'error',
    '@typescript-eslint/prefer-destructuring': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/consistent-type-definitions': 'error',

    // Naming conventions
    '@typescript-eslint/naming-convention': [
      'error',
      {
        'selector': 'class',
        'format': ['PascalCase']
      },
      {
        'selector': 'interface',
        'format': ['PascalCase']
      },
      {
        'selector': 'typeAlias',
        'format': ['PascalCase']
      },
      {
        'selector': 'enum',
        'format': ['PascalCase']
      },
      {
        'selector': 'enumMember',
        'format': ['UPPER_CASE']
      },
      {
        'selector': 'function',
        'format': ['camelCase']
      },
      {
        'selector': 'variable',
        'format': ['camelCase', 'UPPER_CASE', 'PascalCase'],
        'filter': {
          'regex': 'Schema$',
          'match': true
        }
      },
      {
        'selector': 'variable',
        'format': ['camelCase', 'UPPER_CASE'],
        'filter': {
          'regex': 'Schema$',
          'match': false
        }
      },
      {
        'selector': 'parameter',
        'format': ['camelCase'],
        'leadingUnderscore': 'allow'
      }
    ]
  },
  ignorePatterns: [
    'dist/**',
    'dist-simple/**',
    'node_modules/**',
    '**/*.d.ts',
    'scripts/**',
    'coverage/**',
    '*.config.js',
    '*.config.ts'
  ],
  overrides: [
    {
      files: ['**/*.test.ts', '**/__tests__/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'max-len': 'off',
        'max-statements': 'off'
      }
    }
  ]
};
