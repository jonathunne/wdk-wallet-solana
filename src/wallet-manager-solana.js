// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { createSolanaRpc } from '@solana/kit'
import WalletAccountSolana from './wallet-account-solana.js'
import AbstractWalletManager from '@wdk/wallet'

const FEE_RATE_NORMAL_MULTIPLIER = 1.1
const FEE_RATE_FAST_MULTIPLIER = 2.0
const DEFAULT_BASE_FEE = 5000
/** @typedef {import('./wallet-account-solana.js').SolanaWalletConfig} SolanaWalletConfig */
/** @typedef {import('@wdk/wallet').FeeRates} FeeRates */

export default class WalletManagerSolana extends AbstractWalletManager {
  /**
   * Creates a new wallet manager for solana blockchains.
   *
   * @param {string|Uint8Array} seed - The wallet's seed, either as a [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase or a Uint8Array.
   * @param {SolanaWalletConfig} [config] - The configuration object.
   */
  constructor (seed, config = {}) {
    super(seed, config)

    /**
    * The solana wallet configuration.
    *
    * @protected
    * @type {SolanaWalletConfig}
    */
    this._config = config

    /**
    * A map between derivation paths and wallet accounts. It contains all the wallet accounts that have been accessed through the {@link getAccount} and {@link getAccountByPath} methods.
    *
    * @private
    * @type {{ [path: string]: WalletAccountSolana }}
    */
    this._accounts = {}

    /**
     * The Solana RPC client instance.
     * @private
     */
    this._rpc = createSolanaRpc(this._config.rpcUrl)
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path m/44'/501'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountSolana>} The account.
   */
  async getAccount (index = 0) {
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/501'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountSolana>} The account.
   */
  async getAccountByPath (path) {
    if (!this._accounts[path]) {
      const account = await WalletAccountSolana.create(this.seed, path, this._config)
      this._accounts[path] = account
    }
    return this._accounts[path]
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<{FeeRates>} The fee rates (in lamports).
   */
  async getFeeRates () {
    if (!this._rpc) {
      throw new Error(
        'The wallet must be connected to a provider to get fee rates.'
      )
    }

    // Get recent prioritization fees
    const fees = await this._rpc.getRecentPrioritizationFees().send()

    // Find the highest non-zero fee, or use default
    const nonZeroFees = fees.filter(fee => fee.prioritizationFee > 0n)
    const baseFee = nonZeroFees.length > 0
      ? Number(nonZeroFees.reduce((max, fee) => fee.prioritizationFee > max ? fee.prioritizationFee : max, 0n))
      : DEFAULT_BASE_FEE

    const normalFee = Math.round(baseFee * FEE_RATE_NORMAL_MULTIPLIER)
    const fastFee = Math.round(baseFee * FEE_RATE_FAST_MULTIPLIER)

    return {
      normal: normalFee,
      fast: fastFee
    }
  }

  /**
 * Disposes the wallet manager, erasing the seed buffer.
 */
  dispose () {
    for (const account of Object.values(this._accounts)) {
      account.dispose()
    }
    this._accounts = {}
  }
}
