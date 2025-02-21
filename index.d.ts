declare module 'eslint-plugin-unicorn';
declare module '@babel/eslint-plugin';
declare module 'eslint-plugin-disable-autofix';
declare module 'eslint/lib/rules/*';

/* Workaround type declaration that is required because the
eslint-rule-composer library does not include types.
*/
declare module 'eslint-rule-composer' {
  import type { AST, Rule, SourceCode } from 'eslint';

  interface Problem {
    message: string;
    messageId: string | undefined;
    data: object | undefined;
    loc: AST.SourceLocation;
    fix: unknown;
  }
  interface Metadata {
    sourceCode: SourceCode;
    settings?: object;
    filename: string;
  }
  type Predicate<T> = (problem: Problem, metadata: Metadata) => T;
  const eslintRuleComposer: {
    mapReports: (
      rule: Rule.RuleModule,
      iteratee: Predicate<Problem>,
    ) => Rule.RuleModule /* Even newer versions of ESLint will read the
        extraneous schema field introduced by this method instead of meta.schema,
        which is the favored schema position of new ESLint rules. This causes
        newer rules to malfunction.
        */ & { schema: undefined };
  };

  export default eslintRuleComposer;
}
