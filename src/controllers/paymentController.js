import { PaymentService } from '../services/paymentService.js';
import { BlockchainService } from '../services/blockchainService.js';
import { db } from '../services/dbService.js';
import {
  validateCreateOrderInput,
  validateVerifyPaymentInput,
} from '../utils/validation.js';
import { convertInrToEth, verifyWebhookSignature } from '../config/payment.js';
import { ethers } from 'ethers';

export class PaymentController {
  /**
   * POST /api/payments/create-order
   * Validates campaign on-chain and generates a Razorpay payment order
   */
  static async createOrder(req, res, next) {
    try {
      const { campaignId, amount, donorName, donorEmail, donorPhone } = req.body;

      // 1. Input Validation
      const validation = validateCreateOrderInput({
        campaignId,
        amount,
        donorName,
        donorEmail,
        donorPhone,
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join(' '),
        });
      }

      const numAmount = parseFloat(amount);
      const ethAmount = convertInrToEth(numAmount);
      const donationWei = ethers.parseEther(ethAmount.toFixed(6));

      // 2. Validate with Smart Contract that campaign can receive donations
      await BlockchainService.validateCampaignForDonation(campaignId, donationWei);

      // 3. Create Razorpay order
      const order = await PaymentService.createOrder({
        campaignId,
        amountInr: numAmount,
        donorName,
        donorEmail,
        donorPhone,
      });

      res.status(201).json({
        success: true,
        orderId: order.orderId,
        amount: order.amount, // in paise
        amountInr: order.amountInr,
        ethAmount: order.ethAmount,
        currency: order.currency,
        keyId: order.keyId,
        campaignId: Number(campaignId),
        donorName,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/verify
   * Cryptographically verifies payment with payment gateway,
   * then executes the on-chain donation via the backend relayer wallet.
   */
  static async verifyPayment(req, res, next) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      const validation = validateVerifyPaymentInput({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join(' '),
        });
      }

      // 1. Verify Payment & Idempotency Check
      const verification = await PaymentService.verifyPayment({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      const orderRecord = verification.record;

      // Idempotency: If already confirmed on-chain, do NOT submit another transaction
      if (verification.alreadyProcessed && verification.blockchainStatus === 'CONFIRMED') {
        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          paymentStatus: 'paid',
          blockchainStatus: 'confirmed',
          transactionHash: verification.transactionHash,
          campaignId: orderRecord.campaignId,
          amountInr: orderRecord.amountInr,
          amountEth: orderRecord.amountEth,
          message: 'Payment already processed and recorded on blockchain.',
        });
      }

      // 2. Submit Blockchain Donation Transaction
      db.updateBlockchainStatus(razorpay_order_id, {
        blockchainStatus: 'SUBMITTED',
      });

      try {
        const blockchainResult = await BlockchainService.recordDonationOnChain(
          orderRecord.campaignId,
          orderRecord.amountEth
        );

        // Update database with confirmed blockchain transaction
        db.updateBlockchainStatus(razorpay_order_id, {
          blockchainStatus: 'CONFIRMED',
          transactionHash: blockchainResult.transactionHash,
          blockchainDonationId: blockchainResult.donationId,
        });

        res.status(200).json({
          success: true,
          paymentStatus: 'paid',
          blockchainStatus: 'confirmed',
          transactionHash: blockchainResult.transactionHash,
          blockNumber: blockchainResult.blockNumber,
          donationId: blockchainResult.donationId,
          campaignId: orderRecord.campaignId,
          amountInr: orderRecord.amountInr,
          amountEth: orderRecord.amountEth,
          donorName: orderRecord.donorName,
          message: 'Donation successfully verified and recorded on blockchain!',
        });
      } catch (bcErr) {
        console.error('Blockchain submission failed for paid order:', bcErr.message);

        // Failure scenario: Payment succeeded, but blockchain transaction failed
        db.updateBlockchainStatus(razorpay_order_id, {
          blockchainStatus: 'FAILED',
          errorMessage: bcErr.message,
        });

        res.status(200).json({
          success: true,
          paymentStatus: 'paid',
          blockchainStatus: 'failed',
          orderId: razorpay_order_id,
          campaignId: orderRecord.campaignId,
          amountInr: orderRecord.amountInr,
          message:
            'Payment received, but blockchain recording is pending. It will be retried automatically by the backend.',
          error: bcErr.message,
        });
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/payments/webhook
   * Webhook endpoint for asynchronous payment updates
   */
  static async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = JSON.stringify(req.body);

      if (!signature || !verifyWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
      }

      const event = req.body.event;
      if (event === 'payment.captured' || event === 'order.paid') {
        const payment = req.body.payload?.payment?.entity;
        const orderId = payment?.order_id;
        const paymentId = payment?.id;

        if (orderId && paymentId) {
          const record = db.getOrderByOrderId(orderId);
          if (record && record.blockchainStatus !== 'CONFIRMED') {
            db.updatePaymentStatus(orderId, 'PAID', paymentId);
            try {
              const bcResult = await BlockchainService.recordDonationOnChain(
                record.campaignId,
                record.amountEth
              );
              db.updateBlockchainStatus(orderId, {
                blockchainStatus: 'CONFIRMED',
                transactionHash: bcResult.transactionHash,
                blockchainDonationId: bcResult.donationId,
              });
            } catch (err) {
              db.updateBlockchainStatus(orderId, {
                blockchainStatus: 'FAILED',
                errorMessage: err.message,
              });
            }
          }
        }
      }

      res.status(200).json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  }
}
