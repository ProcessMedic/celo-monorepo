import sleep from 'sleep-promise'
import {
  createDefaultIngressIfNotExists,
  createGrafanaTagAnnotation,
  getInstanceName,
  getReleaseName,
  installNFSServerProvisioner,
  removeHelmRelease,
  upgradeHelmChart,
} from 'src/lib/blockscout'
import { switchToClusterFromEnv } from 'src/lib/cluster'
import { execCmd } from 'src/lib/cmd-utils'
import { envVar, fetchEnvOrFallback } from 'src/lib/env-utils'
import {
  isCelotoolHelmDryRun,
  resetCloudSQLInstance,
  retrieveCloudSQLConnectionInfo,
} from 'src/lib/helm_deploy'
import yargs from 'yargs'
import { UpgradeArgv } from '../../deploy/upgrade'

export const command = 'blockscout'
export const describe = 'upgrade an existing deploy of the blockscout package'

export const builder = (argv: yargs.Argv) => {
  return argv
    .option('reset', {
      type: 'boolean',
      description:
        'when enabled, deletes the database and redeploys the helm chart. keeps the instance.',
      default: false,
    })
    .option('tag', {
      type: 'string',
      description: 'Docker image tag to deploy',
    })
    .option('suffix', {
      type: 'string',
      description: 'Instance suffix',
      default: '',
    })
    .demandOption(['tag'])
}

type BlockscoutUpgradeArgv = UpgradeArgv & {
  reset: boolean
  tag: string
  suffix: string
}

export const handler = async (argv: BlockscoutUpgradeArgv) => {
  await switchToClusterFromEnv(argv.celoEnv)

  const dbSuffix = argv.suffix || fetchEnvOrFallback(envVar.BLOCKSCOUT_DB_SUFFIX, '')
  const imageTag = argv.tag
  const instanceName = getInstanceName(argv.celoEnv, dbSuffix)
  const helmReleaseName = getReleaseName(argv.celoEnv, dbSuffix)

  const [
    blockscoutDBUsername,
    blockscoutDBPassword,
    blockscoutDBConnectionName,
  ] = await retrieveCloudSQLConnectionInfo(argv.celoEnv, instanceName, dbSuffix)

  if (!isCelotoolHelmDryRun()) {
    if (argv.reset === true) {
      console.info(
        'Running upgrade with --reset flag which will reset the database and reinstall the helm chart'
      )

      await removeHelmRelease(helmReleaseName, argv.celoEnv)

      console.info('Sleep for 30 seconds to have all connections killed')
      await sleep(30000)
      await resetCloudSQLInstance(instanceName)
    } else {
      console.info(`Delete blockscout-migration`)
      try {
        const jobName = `${argv.celoEnv}-blockscout${dbSuffix}-migration`
        await execCmd(`kubectl delete job ${jobName} -n ${argv.celoEnv}`)
      } catch (error) {
        console.error(error)
      }
    }
  } else {
    console.info(
      `Skipping Cloud SQL Database upgrade process (recreation or kubernetes job removal). Please check if you can execute the skipped steps.`
    )
  }

  await upgradeHelmChart(
    argv.celoEnv,
    helmReleaseName,
    imageTag,
    blockscoutDBUsername,
    blockscoutDBPassword,
    blockscoutDBConnectionName
  )

  if (!isCelotoolHelmDryRun()) {
    await createGrafanaTagAnnotation(argv.celoEnv, imageTag, dbSuffix)
    await installNFSServerProvisioner(argv.celoEnv)
    await createDefaultIngressIfNotExists(argv.celoEnv, helmReleaseName)
  }
}
