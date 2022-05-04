/* tslint:disable:no-console */
import { CeloContractName } from '@celo/protocol/lib/registry-utils'
import { deploymentForCoreContract } from '@celo/protocol/lib/web3-utils'
import { config } from '@celo/protocol/migrationsConfig'
import { StableTokenRegistryInstance } from 'types'

const initializeArgs = async (): Promise<any[]> => {
  return [config.stableTokenRegistry.fiatTicker, config.stableTokenRegistry.stableTokenContractName]
}

module.exports = deploymentForCoreContract<StableTokenRegistryInstance>(
  web3,
  artifacts,
  CeloContractName.StableTokenRegistry,
  initializeArgs
)
