import { db } from '../services/dbService.js';
import { BlockchainService } from '../services/blockchainService.js';

export class DonationController {
  /**
   * GET /api/donations
   * Returns all donations from database
   */
  static async getAllDonations(req, res, next) {
    try {
      const { campaignId, donorEmail, status } = req.query;
      const filter = {};
      if (campaignId) filter.campaignId = campaignId;
      if (donorEmail) filter.donorEmail = donorEmail;
      if (status) filter.paymentStatus = status;

      const donations = db.getAllDonations(filter);

      res.status(200).json({
        success: true,
        count: donations.length,
        donations,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/donations/:id
   * Looks up a single donation by record ID, orderId, or paymentId
   */
  static async getDonationById(req, res, next) {
    try {
      const { id } = req.params;
      const donation = db.getRecordById(id);

      if (!donation) {
        return res.status(404).json({
          success: false,
          message: `Donation record '${id}' not found.`,
        });
      }

      res.status(200).json({
        success: true,
        donation,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/donations/:id/retry
   * Retries an on-chain transaction for a payment that succeeded but failed blockchain submission
   */
  static async retryDonation(req, res, next) {
    try {
      const { id } = req.params;
      const record = db.getRecordById(id);

      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found.' });
      }

      if (record.paymentStatus !== 'PAID') {
        return res.status(400).json({
          success: false,
          message: 'Cannot retry blockchain submission: payment is not marked as PAID.',
        });
      }

      if (record.blockchainStatus === 'CONFIRMED') {
        return res.status(200).json({
          success: true,
          message: 'Donation is already confirmed on blockchain.',
          transactionHash: record.transactionHash,
          record,
        });
      }

      // Execute retry
      db.updateBlockchainStatus(record.orderId, { blockchainStatus: 'SUBMITTED' });

      try {
        const bcResult = await BlockchainService.recordDonationOnChain(
          record.campaignId,
          record.amountEth
        );

        const updated = db.updateBlockchainStatus(record.orderId, {
          blockchainStatus: 'CONFIRMED',
          transactionHash: bcResult.transactionHash,
          blockchainDonationId: bcResult.donationId,
          errorMessage: null,
        });

        res.status(200).json({
          success: true,
          message: 'Blockchain donation retry successful!',
          transactionHash: bcResult.transactionHash,
          record: updated,
        });
      } catch (err) {
        db.updateBlockchainStatus(record.orderId, {
          blockchainStatus: 'FAILED',
          errorMessage: err.message,
        });
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
}
