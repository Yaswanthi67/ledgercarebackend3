import { BlockchainService } from '../services/blockchainService.js';
import { db } from '../services/dbService.js';

export class CampaignController {
  /**
   * GET /api/campaigns
   * Returns all campaigns (on-chain + registered)
   */
  static async getAllCampaigns(req, res, next) {
    try {
      const onChainCampaigns = await BlockchainService.getAllCampaigns();
      const dbCampaigns = db.getAllCampaigns();

      // Merge campaigns by campaignId: prefer db metadata (category, image, inr amounts) + live on-chain balances
      const merged = onChainCampaigns.map((onChain) => {
        const dbMatch = dbCampaigns.find((dbc) => Number(dbc.campaignId) === Number(onChain.campaignId));
        if (dbMatch) {
          return {
            ...dbMatch,
            ...onChain,
            category: dbMatch.category || onChain.category || 'General',
            imageUrl: dbMatch.imageUrl || onChain.imageUrl || '',
            targetAmountInr: dbMatch.targetAmountInr || Math.round(parseFloat(onChain.targetAmountEth || '1') * 250000),
            raisedAmountInr: dbMatch.raisedAmountInr || Math.round(parseFloat(onChain.raisedAmountEth || '0') * 250000),
            charityName: dbMatch.charityName || onChain.charityName || 'Verified Charity',
          };
        }
        return {
          ...onChain,
          category: onChain.category || 'General',
          targetAmountInr: Math.round(parseFloat(onChain.targetAmountEth || '1') * 250000),
          raisedAmountInr: Math.round(parseFloat(onChain.raisedAmountEth || '0') * 250000),
        };
      });

      for (const dbc of dbCampaigns) {
        const exists = merged.some((m) => Number(m.campaignId) === Number(dbc.campaignId));
        if (!exists) {
          merged.push(dbc);
        }
      }

      res.status(200).json({
        success: true,
        count: merged.length,
        campaigns: merged,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/campaigns
   * Deploys and registers a new charity campaign
   */
  static async createCampaign(req, res, next) {
    try {
      const {
        title,
        description,
        targetAmount,
        targetAmountInr,
        targetAmountEth,
        startDate,
        endDate,
        category,
        imageUrl,
        charityId,
        charityName,
      } = req.body;

      if (!title || (!targetAmount && !targetAmountInr && !targetAmountEth)) {
        return res.status(400).json({
          success: false,
          message: 'title and targetAmount are required.',
        });
      }

      // 1. Deploy on-chain via BlockchainService
      const campaignRecord = await BlockchainService.createCampaign({
        title,
        description,
        targetAmount,
        targetAmountInr,
        targetAmountEth,
        startDate,
        endDate,
        category,
        imageUrl,
        charityId,
        charityName,
      });

      // 2. Persist in local database store
      db.saveCampaign(campaignRecord);

      res.status(201).json({
        success: true,
        campaignId: campaignRecord.campaignId,
        campaign: campaignRecord,
        transactionHash: campaignRecord.transactionHash,
        message: 'Campaign created successfully and registered on CampaignManager.',
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
      let onChain = await BlockchainService.getCampaign(Number(id));
      const dbCamp = db.getAllCampaigns().find((c) => Number(c.campaignId) === Number(id));

      if (!onChain && !dbCamp) {
        return res.status(404).json({
          success: false,
          message: `Campaign #${id} not found.`,
        });
      }

      let campaign;
      if (onChain && dbCamp) {
        campaign = {
          ...dbCamp,
          ...onChain,
          category: dbCamp.category || onChain.category || 'General',
          imageUrl: dbCamp.imageUrl || onChain.imageUrl || '',
          targetAmountInr: dbCamp.targetAmountInr || Math.round(parseFloat(onChain.targetAmountEth || '1') * 250000),
          raisedAmountInr: dbCamp.raisedAmountInr || Math.round(parseFloat(onChain.raisedAmountEth || '0') * 250000),
          charityName: dbCamp.charityName || onChain.charityName || 'Verified Charity',
        };
      } else if (onChain) {
        campaign = {
          ...onChain,
          category: onChain.category || 'General',
          targetAmountInr: Math.round(parseFloat(onChain.targetAmountEth || '1') * 250000),
          raisedAmountInr: Math.round(parseFloat(onChain.raisedAmountEth || '0') * 250000),
        };
      } else {
        campaign = dbCamp;
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
