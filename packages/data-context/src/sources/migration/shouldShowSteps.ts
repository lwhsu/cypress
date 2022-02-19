import globby from 'globby'
import path from 'path'
import { MIGRATION_STEPS, TestingType } from '@packages/types'
import { getSpecs, OldCypressConfig, tryGetDefaultLegacySupportFile } from '.'

export function getTestFilesGlobs (config: OldCypressConfig, type: 'component' | 'integration'): string[] {
  // super awkward how we call it integration tests, but the key to override
  // the config is `e2e`
  const k = type === 'component' ? 'component' : 'e2e'

  const glob = config[k]?.testFiles ?? config.testFiles

  if (glob) {
    return ([] as string[]).concat(glob)
  }

  return ['**/*']
}

export function getIntegrationTestFilesGlobs (config: OldCypressConfig): string[] {
  return getTestFilesGlobs(config, 'integration')
}

export function getComponentTestFilesGlobs (config: OldCypressConfig): string[] {
  return getTestFilesGlobs(config, 'component')
}

export function isDefaultTestFiles (config: OldCypressConfig, type: 'component' | 'integration') {
  const testFiles = type === 'component'
    ? getComponentTestFilesGlobs(config)
    : getIntegrationTestFilesGlobs(config)

  return testFiles.length === 1 && testFiles[0] === '**/*'
}

export function getPluginsFile (config: OldCypressConfig) {
  if (config.e2e?.pluginsFile === false || config.pluginsFile === false) {
    return false
  }

  return config.e2e?.pluginsFile ?? config.pluginsFile ?? 'cypress/plugins/index.js'
}

export const OLD_NAMES = {
  component: 'component',
  e2e: 'integration',
} as const

export function getFolder (config: OldCypressConfig, testingType: TestingType) {
  const oldName = OLD_NAMES[testingType]
  const oldNameFolder = `${oldName}Folder` as const

  if (config[testingType]?.[oldNameFolder] === false || config[oldNameFolder] === false) {
    return false
  }

  return config[testingType]?.[oldNameFolder] ?? config[oldNameFolder] ?? `cypress/${oldName}`
}

export function getIntegrationFolder (config: OldCypressConfig) {
  if (config.e2e?.integrationFolder === false || config.integrationFolder === false) {
    return false
  }

  return config.e2e?.integrationFolder ?? config.integrationFolder ?? 'cypress/integration'
}

export function getComponentFolder (config: OldCypressConfig) {
  if (config.component?.componentFolder === false || config.componentFolder === false) {
    return false
  }

  return config.component?.componentFolder ?? config.componentFolder ?? 'cypress/component'
}

async function hasSpecFiles (projectRoot: string, dir: string, testFilesGlob: string[]): Promise<boolean> {
  const f = await globby(testFilesGlob, { cwd: path.join(projectRoot, dir) })

  return f.length > 0
}
export async function shouldShowAutoRenameStep (projectRoot: string, configE2e: OldCypressConfig, configComponent: OldCypressConfig) {
  const integration = await getSpecs(projectRoot, configE2e, 'e2e')
  const component = await getSpecs(projectRoot, configComponent, 'component')

  // if we have at least one spec to auto migrate in either Ct or E2E, we return true.
  return integration.length > 0 || component.length > 0
}

async function anyComponentSpecsExist (projectRoot: string, config: OldCypressConfig) {
  const componentFolder = getComponentFolder(config)

  if (componentFolder === false) {
    return false
  }

  const componentTestFiles = getComponentTestFilesGlobs(config)

  return hasSpecFiles(projectRoot, componentFolder, componentTestFiles)
}

async function anyIntegrationSpecsExist (projectRoot: string, config: OldCypressConfig) {
  const integrationFolder = getIntegrationFolder(config)

  if (integrationFolder === false) {
    return false
  }

  const integrationTestFiles = getIntegrationTestFilesGlobs(config)

  return hasSpecFiles(projectRoot, integrationFolder, integrationTestFiles)
}

// we only show rename support file if they are using the default
// if they have anything set in their config, we will not try to rename it.
// Also, if there are no **no** integration specs, we are doing a CT only migration,
// in which case we don't migrate the supportFile - they'll make a new support/component.js
// when they set CT up.
export async function shouldShowRenameSupport (projectRoot: string, config: OldCypressConfig) {
  if (!await anyIntegrationSpecsExist(projectRoot, config)) {
    return false
  }

  const defaultSupportFile = 'cypress/support/index.'
  let supportFile = config.e2e?.supportFile ?? config.supportFile

  if (supportFile === undefined) {
    const foundDefaultSupportFile = await tryGetDefaultLegacySupportFile(projectRoot)

    if (foundDefaultSupportFile) {
      supportFile = foundDefaultSupportFile
    }
  }

  // if the support file is set to false, we don't show the rename step
  // if the support file does not exist (value is undefined), we don't show the rename step
  if (!supportFile) {
    return false
  }

  // if the support file is custom, we don't show the rename step
  // only if the support file matches the default do we show the rename step
  return supportFile.includes(defaultSupportFile)
}

// if they have component testing configured using the defaults, they will need to
// rename/move their specs.
async function shouldShowRenameManual (projectRoot: string, config: OldCypressConfig) {
  const componentFolder = getComponentFolder(config)

  const usingAllDefaults = componentFolder === 'cypress/component' && isDefaultTestFiles(config, 'component')

  if (componentFolder === false || !usingAllDefaults) {
    return false
  }

  return anyComponentSpecsExist(projectRoot, config)
}

// All projects must move from cypress.json to cypress.config.js!
export function shouldShowConfigFileStep () {
  return true
}

export type Step = typeof MIGRATION_STEPS[number]

export async function getStepsForMigration (
  projectRoot: string,
  configE2e: OldCypressConfig,
  configComponent: OldCypressConfig,
): Promise<Step[]> {
  const steps: Step[] = []

  for (const step of MIGRATION_STEPS) {
    if (step === 'renameAuto' && await shouldShowAutoRenameStep(projectRoot, configE2e, configComponent)) {
      steps.push(step)
    }

    if (step === 'renameManual' && await shouldShowRenameManual(projectRoot, configComponent)) {
      steps.push(step)
    }

    if (step === 'renameSupport' && await shouldShowRenameSupport(projectRoot, configE2e)) {
      steps.push(step)
    }

    if (step === 'configFile' && shouldShowConfigFileStep()) {
      steps.push(step)
    }

    // if we are showing rename manual, this implies
    // component testing is configured.
    if (step === 'setupComponent' && await anyComponentSpecsExist(projectRoot, configComponent)) {
      steps.push(step)
    }
  }

  return steps
}
