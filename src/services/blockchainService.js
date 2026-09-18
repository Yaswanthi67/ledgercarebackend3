import { ethers } from 'ethers';
import {
  provider,
  getBackendSigner,
  getContractWithSigner,
  getReadOnlyContract,
  CONTRACT_ADDRESSES,
  CHAIN_ID,
} from '../config/blockchain.js';

export class BlockchainService {
  /**
   * Health check for blockchain connection and backend wallet
   */
  static async getHealth() {
    try {
      const network = await provider.getNetwork();
      const signer = getBackendSigner();
      const balance = await provider.getBalance(signer.address);

      return {
        connected: true,
        chainId: Number(network.chainId),
        targetChainId: CHAIN_ID,
        signerAddress: signer.address,
        signerBalanceEth: ethers.formatEther(balance),
        contracts: CONTRACT_ADDRESSES,
      };
    } catch (err) {
      return {
        connected: false,
        error: err.message,
      };
    }
  }

  /**
   * Validates if a campaign can receive donations
   */
  static async validateCampaignForDonation(campaignId, donationWei) {
    const campaignManager = getReadOnlyContract('CampaignManager');
    const [targetAmount, raisedAmount, startDate, endDate, status] =
      await campaignManager.getCampaignForDonation(campaignId);

    const now = Math.floor(Date.now() / 1000);

    if (Number(status) !== 0) {
      throw new Error('Campaign is not currently active.');
    }
    if (BigInt(now) < startDate) {
      throw new Error('Campaign has not started yet.');
    }
    if (BigInt(now) > endDate) {
      throw new Error('Campaign has ended.');
    }
    if (raisedAmount + donationWei > targetAmount) {
      const remainingWei = targetAmount - raisedAmount;
      throw new Error(
        `Donation exceeds remaining campaign goal. Maximum allowable is ${ethers.formatEther(remainingWei)} ETH.`
      );
    }

    return {
      targetAmount,
      raisedAmount,
      startDate,
      endDate,
      status,
    };
  }

  /**
   * Submits a donation transaction to DonationLedger using backend signer
   */
  static async recordDonationOnChain(campaignId, ethAmount) {
    const donationLedger = getContractWithSigner('DonationLedger');
    const donationWei = ethers.parseEther(ethAmount.toFixed(6));

    // Validate campaign state on blockchain first
    await this.validateCampaignForDonation(campaignId, donationWei);

    // Execute donate function
    const tx = await donationLedger.donate(campaignId, {
      value: donationWei,
    });

    // Wait for 1 confirmation
    const receipt = await tx.wait(1);

    // Extract DonationRecorded event
    let donationId = null;
    if (receipt && receipt.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = donationLedger.interface.parseLog(log);
          if (parsed && parsed.name === 'DonationRecorded') {
            donationId = Number(parsed.args.donationId);
            break;
          }
        } catch {
          // Log was from another contract
        }
      }
    }

    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      donationId,
      ethAmount,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Reads a single campaign by ID
   */
  static async getCampaign(campaignId) {
    const campaignManager = getReadOnlyContract('CampaignManager');
    const charityRegistry = getReadOnlyContract('CharityRegistry');

    const camp = await campaignManager.getCampaign(campaignId);
    if (!camp || Number(camp.campaignId) === 0) return null;

    let charityInfo = null;
    try {
      const c = await charityRegistry.getCharity(camp.charityId);
      charityInfo = {
        charityId: Number(c.charityId),
        organizationName: c.organizationName,
        registrationNumber: c.registrationNumber,
        email: c.email,
        walletAddress: c.walletAddress,
        verified: c.verified,
        registeredAt: Number(c.registeredAt),
      };
    } catch {
      // charity registry load failed
    }

    return {
      campaignId: Number(camp.campaignId),
      charityId: Number(camp.charityId),
      charityWallet: camp.charityWallet,
      charity: charityInfo,
      title: camp.title,
      description: camp.description,
      targetAmount: camp.targetAmount.toString(),
      targetAmountEth: ethers.formatEther(camp.targetAmount),
      raisedAmount: camp.raisedAmount.toString(),
      raisedAmountEth: ethers.formatEther(camp.raisedAmount),
      withdrawnAmount: camp.withdrawnAmount.toString(),
      withdrawnAmountEth: ethers.formatEther(camp.withdrawnAmount),
      startDate: Number(camp.startDate),
      endDate: Number(camp.endDate),
      status: Number(camp.status),
    };
  }

  /**
   * Reads all campaigns
   */
  static async getAllCampaigns() {
    const campaignManager = getReadOnlyContract('CampaignManager');
    const charityRegistry = getReadOnlyContract('CharityRegistry');

    const campaigns = [];
    let campaignId = 1;
    let keepFetching = true;

    while (keepFetching && campaignId <= 100) {
      try {
        const camp = await campaignManager.getCampaign(campaignId);
        if (!camp || Number(camp.campaignId) === 0) {
          keepFetching = false;
          break;
        }

        let orgName = 'Registered Charity';
        try {
          const c = await charityRegistry.getCharity(camp.charityId);
          if (c && c.organizationName) orgName = c.organizationName;
        } catch {}

        campaigns.push({
          campaignId: Number(camp.campaignId),
          charityId: Number(camp.charityId),
          charityWallet: camp.charityWallet,
          charityName: orgName,
          title: camp.title,
          description: camp.description,
          targetAmount: camp.targetAmount.toString(),
          targetAmountEth: ethers.formatEther(camp.targetAmount),
          raisedAmount: camp.raisedAmount.toString(),
          raisedAmountEth: ethers.formatEther(camp.raisedAmount),
          withdrawnAmount: camp.withdrawnAmount.toString(),
          withdrawnAmountEth: ethers.formatEther(camp.withdrawnAmount),
          startDate: Number(camp.startDate),
          endDate: Number(camp.endDate),
          status: Number(camp.status),
        });

        campaignId++;
      } catch {
        keepFetching = false;
      }
    }

    return campaigns;
  }

  /**
   * Reads on-chain donations for a campaign
   */
  static async getCampaignDonations(campaignId) {
    const donationLedger = getReadOnlyContract('DonationLedger');
    const donationIds = await donationLedger.getCampaignDonations(campaignId);
    const list = [];

    for (const dId of donationIds) {
      try {
        const don = await donationLedger.getDonation(dId);
        list.push({
          donationId: Number(don.donationId),
          campaignId: Number(don.campaignId),
          donor: don.donor,
          amount: don.amount.toString(),
          amountEth: ethers.formatEther(don.amount),
          timestamp: Number(don.timestamp),
        });
      } catch {}
    }

    return list.reverse();
  }

  /**
   * Reads on-chain fund usages & evidence for a campaign
   */
  static async getCampaignFundUsages(campaignId) {
    const tracker = getReadOnlyContract('FundEvidenceTracker');
    const usageIds = await tracker.getCampaignFundUsages(campaignId);
    const list = [];

    for (const uId of usageIds) {
      try {
        const usage = await tracker.getFundUsage(uId);
        list.push({
          usageId: Number(usage.usageId),
          campaignId: Number(usage.campaignId),
          charityWallet: usage.charityWallet,
          amount: usage.amount.toString(),
          amountEth: ethers.formatEther(usage.amount),
          purpose: usage.purpose,
          evidenceHash: usage.evidenceHash,
          timestamp: Number(usage.timestamp),
        });
      } catch {}
    }

    return list.reverse();
  }

  /**
   * Reads on-chain evidence hash for a fund usage record
   */
  static async getEvidenceHash(usageId) {
    const tracker = getReadOnlyContract('FundEvidenceTracker');
    return await tracker.getEvidenceHash(usageId);
  }

  /**
   * Reads all charities
   */
  static async getAllCharities() {
    const registry = getReadOnlyContract('CharityRegistry');
    const charities = [];
    let charityId = 1;
    let keepFetching = true;

    while (keepFetching && charityId <= 100) {
      try {
        const c = await registry.getCharity(charityId);
        if (!c || Number(c.charityId) === 0) {
          keepFetching = false;
          break;
        }

        charities.push({
          charityId: Number(c.charityId),
          organizationName: c.organizationName,
          registrationNumber: c.registrationNumber,
          email: c.email,
          walletAddress: c.walletAddress,
          verified: c.verified,
          registeredAt: Number(c.registeredAt),
        });

        charityId++;
      } catch {
        keepFetching = false;
      }
    }

    return charities;
  }
}
