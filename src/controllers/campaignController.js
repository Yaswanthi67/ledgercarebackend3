import { BlockchainService } from '../services/blockchainService.js';
import { db } from '../services/dbService.js';

export class CampaignController {
  /**
   * GET /api/campaigns
   * Returns all campaigns from the blockchain
   */
  static async getAllCampaigns(req, res, next) {
    try {
      const campaigns = await BlockchainService.getAllCampaigns();
      res.status(200).json({
        success: true,
        count: campaigns.length,
        campaigns,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/campaigns/:id
   * Returns a single campaign by ID
   */
  static async getCampaignById(req, res, next) {
    try {
      const { id } = req.params;
      const campaign = await BlockchainService.getCampaign(Number(id));

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: `Campaign #${id} not found on the blockchain.`,
        });
      }

      res.status(200).json({
        success: true,
        campaign,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/campaigns/:id/donations
   * Returns donations for a campaign (on-chain + off-chain INR data)
   */
  static async getCampaignDonations(req, res, next) {
    try {
      const { id } = req.params;
      const campaignId = Number(id);

      // On-chain donations
      const onChainDonations = await BlockchainService.getCampaignDonations(campaignId);

      // Off-chain payment records from database
      const dbDonations = db.getAllDonations({ campaignId });

      // Merge on-chain with payment metadata
      const merged = onChainDonations.map((d) => {
        const matched = dbDonations.find(
          (rec) =>
            rec.transactionHash &&
            (rec.blockchainDonationId === d.donationId ||
              Math.abs(Number(rec.amountEth) - Number(d.amountEth)) < 0.0001)
        );

        return {
          ...d,
          amountInr: matched ? matched.amountInr : null,
          donorName: matched ? matched.donorName : 'Anonymous Donor',
          paymentStatus: matched ? matched.paymentStatus : 'PAID',
          blockchainStatus: 'CONFIRMED',
          orderId: matched ? matched.orderId : null,
        };
      });

      res.status(200).json({
        success: true,
        campaignId,
        count: merged.length,
        donations: merged,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/campaigns/:id/usages
   * Returns fund usages & evidence for a campaign
   */
  static async getCampaignUsages(req, res, next) {
    try {
      const { id } = req.params;
      const usages = await BlockchainService.getCampaignFundUsages(Number(id));

      res.status(200).json({
        success: true,
        campaignId: Number(id),
        count: usages.length,
        usages,
      });
    } catch (err) {
      next(err);
    }
  }
}
