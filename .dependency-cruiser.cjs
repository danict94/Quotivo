module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      comment: 'Guardrail iniziale: segnala solo dipendenze circolari.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: '(^|/)(node_modules|build|dist|generated|android|ios)(/|$)',
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
