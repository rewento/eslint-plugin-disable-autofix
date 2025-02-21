import type { ESLint, Rule } from 'eslint';
import type { Dirent } from 'node:fs';
import appRootPath from 'app-root-path';
import eslintRuleComposer from 'eslint-rule-composer';
import fs from 'node:fs/promises';
import path from 'node:path';

// See notes in index.d.ts
type Rule = Rule.RuleModule & { schema: never };
interface RulePlugin {
  rules?: Record<string, Rule>;
}
type RulePluginModule =
  | RulePlugin
  | {
      default: RulePlugin | { plugin: RulePlugin };
    };

async function getCoreRulesWithoutFix(
  eslintCorePath: string,
): Promise<Record<string, Rule>> {
  const noFixRules: Awaited<ReturnType<typeof getCoreRulesWithoutFix>> = {};
  const eslintCoreRulesPath = path.join(eslintCorePath, 'lib/rules');
  const ruleFileExtension = '.js';
  const rulesDirEntNames = await fs.readdir(eslintCoreRulesPath);
  for (const dirEntName of rulesDirEntNames) {
    const isRuleFilename =
      dirEntName.endsWith(ruleFileExtension) &&
      dirEntName !== `index${ruleFileExtension}`;
    if (!isRuleFilename) {
      continue;
    }
    const rulePath = path.join(eslintCoreRulesPath, dirEntName);
    /* This unsound type assertion below is justified by
        (1) runtime tests that demonstrate the subject value serving in
        the role of the asserted type without error
        (2) the onerousness and negative impact to code readability
        that would come from mapping the subject value into a new value
        of the asserted type
        */
    const { default: rule } = (await import(rulePath)) as {
      default: Rule;
    };
    const ruleId = dirEntName.replace(ruleFileExtension, '');
    noFixRules[ruleId] = toRuleWithoutFix(rule);
  }
  return noFixRules;
}

async function getDisableAutofixPlugin(): Promise<ESLint.Plugin> {
  return {
    meta: {
      name: 'eslint-plugin-disable-autofix',
      version: 'custom ESM conversion',
    },
    rules: await getDisableAutofixPluginRules(),
  };
}

async function getDisableAutofixPluginRules(): Promise<Record<string, Rule>> {
  let noFixRules: Record<string, Rule> = {};
  const nodeModulesPath = path.join(appRootPath.toString(), 'node_modules');
  const nodeModulesDirEntNames = await fs.readdir(nodeModulesPath, {
    withFileTypes: true,
  });
  for (const dirEnt of nodeModulesDirEntNames) {
    if (dirEnt.isFile()) {
      continue;
    }
    const isExcluded = dirEnt.name === '@types';
    if (isExcluded) {
      continue;
    }
    const isForEslintCore = dirEnt.name === 'eslint';
    if (isForEslintCore) {
      const eslintCorePath = path.join(dirEnt.parentPath, dirEnt.name);
      noFixRules = {
        ...noFixRules,
        ...(await getCoreRulesWithoutFix(eslintCorePath)),
      };
      continue;
    }
    if (isFsObjNameForPluginDir(dirEnt)) {
      noFixRules = {
        ...noFixRules,
        ...(await getUnscopedPluginRulesWithoutFix(dirEnt.name)),
      };
      continue;
    }
    const isScoped = dirEnt.name.startsWith('@');
    if (isScoped) {
      noFixRules = {
        ...noFixRules,
        ...(await getScopedPluginRulesWithoutFix(nodeModulesPath, dirEnt.name)),
      };
    }
  }
  return noFixRules;
}

function getPluginFromPluginModule(pluginModule: RulePluginModule): RulePlugin {
  let plugin: RulePlugin;
  if ('default' in pluginModule) {
    plugin =
      'plugin' in pluginModule.default
        ? pluginModule.default.plugin
        : pluginModule.default;
  } else {
    plugin = pluginModule;
  }
  return plugin;
}

function getPluginRulesWithoutFix(
  plugin: RulePlugin,
  pluginName: string,
): Record<string, Rule> {
  return Object.fromEntries(
    Object.entries(plugin.rules ?? {}).map(([ruleId, rule]) => [
      `${pluginName}/${ruleId}`,
      toRuleWithoutFix(rule),
    ]),
  );
}

async function getScopedPluginRulesWithoutFix(
  nodeModulesPath: string,
  nodeModuleName: string,
): Promise<Record<string, Rule>> {
  let noFixRules: Awaited<ReturnType<typeof getScopedPluginRulesWithoutFix>> =
    {};
  const nodeModulesDirEnts = await fs.readdir(
    path.join(nodeModulesPath, nodeModuleName),
    { withFileTypes: true },
  );
  for (const dirEnt of nodeModulesDirEnts) {
    if (dirEnt.isFile() || !isFsObjNameForPluginDir(dirEnt)) {
      continue;
    }
    const pluginSpecifier = path.posix.join(nodeModuleName, dirEnt.name);
    /* This unsound type assertion is justified by
        (1) runtime tests that demonstrate the subject value serving in
        the role of the asserted type without error
        (2) the onerousness and negative impact to code readability
        that would come from mapping the subject value into a new value
        of the asserted type
        */
    const pluginModule = (await import(pluginSpecifier)) as RulePluginModule;
    const plugin = getPluginFromPluginModule(pluginModule);
    const pluginName = pluginSpecifier.replace(
      /(?:\/eslint-plugin$)|(?:eslint-plugin-)/u,
      '',
    );
    noFixRules = {
      ...noFixRules,
      ...getPluginRulesWithoutFix(plugin, pluginName),
    };
  }
  return noFixRules;
}

async function getUnscopedPluginRulesWithoutFix(
  pluginSpecifier: string,
): Promise<Record<string, Rule>> {
  /* This unsound type assertion is justified by
    (1) runtime tests that demonstrate the subject value serving in
    the role of the asserted type without error
    (2) the onerousness and negative impact to code readability
    that would come from mapping the subject value into a new value
    of the asserted type
    */
  const pluginModule = (await import(pluginSpecifier)) as RulePluginModule;
  const plugin = getPluginFromPluginModule(pluginModule);
  const pluginName = pluginSpecifier.replace(/^eslint-plugin-/u, '');
  return getPluginRulesWithoutFix(plugin, pluginName);
}

function isFsObjNameForPluginDir(dirEnt: Dirent): boolean {
  return dirEnt.name.startsWith('eslint-plugin');
}

function toRuleWithoutFix(rule: Rule): Rule {
  return toRuleWithoutFixMetadata(toRuleWithoutProblemFix(rule));
}

function toRuleWithoutFixMetadata(rule: Rule): Rule {
  return {
    ...rule,
    meta: {
      ...rule.meta,
      fixable: undefined,
    },
  };
}

function toRuleWithoutProblemFix(rule: Rule): Rule {
  // See notes in eslint-rule-composer.d.ts.
  const ruleWithoutProblemFixButWithExtraneousSchema =
    eslintRuleComposer.mapReports(rule, (problem) => ({
      ...problem,
      fix: undefined,
    }));
  const ruleWithoutProblemFix: Omit<
    typeof ruleWithoutProblemFixButWithExtraneousSchema,
    'schema'
  > &
    Partial<
      Pick<typeof ruleWithoutProblemFixButWithExtraneousSchema, 'schema'>
    > = {
    ...ruleWithoutProblemFixButWithExtraneousSchema,
  };
  delete ruleWithoutProblemFix.schema;
  // Narrowing type assertion justified by statements above.
  return ruleWithoutProblemFix as ReturnType<typeof toRuleWithoutProblemFix>;
}

export default await getDisableAutofixPlugin();
