import { ESLint } from 'eslint';
import eslintPluginDisableAutofix from 'eslint-plugin-disable-autofix';

const eslint = async (text: string, config: ESLint.ConfigData) => {
  try {
    const options: ESLint.Options = {
      fix: true,
      // @ts-ignore - To do - Revise this test code to satisfy the TypeScript compiler that `config` is the right type.
      overrideConfig: config,
      useEslintrc: false,
      plugins: {
        'eslint-plugin-disable-autofix': eslintPluginDisableAutofix,
      },
    };

    const eslint = new ESLint(options);
    const results = await eslint.lintText(text);

    return results[0].output;
  } catch (error) {
    return error;
  }
};

export default eslint;
