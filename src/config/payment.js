import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export const PAYMENT_KEY_ID = process.env.PAYMENT_KEY_ID || 'rzp_test_demo';
export const PAYMENT_KEY_SECRET = process.env.PAYMENT_KEY_SECRET || 'secret_test_demo';
export const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'webhook_secret_demo';

// Demo conversion rate: 1 ETH = ₹250,000 INR => rate = 0.000004
// E.g. ₹500 * 0.000004 = 0.002 ETH
export const INR_TO_ETH_RATE = parseFloat(process.env.INR_TO_ETH_RATE || '0.000004');

let razorpayInstance = null;

export const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: PAYMENT_KEY_ID,
      key_secret: PAYMENT_KEY_SECRET,
    });
  }
  return razorpayInstance;
};

/**
 * Converts an INR amount to native ETH amount
 * @param {number} inrAmount - Amount in INR
 * @returns {number} ethAmount - Equivalent ETH amount
 */
export const convertInrToEth = (inrAmount) => {
  const eth = inrAmount * INR_TO_ETH_RATE;
  // round to 6 decimals
  return Math.round(eth * 1e6) / 1e6;
};

/**
 * Verifies Razorpay payment signature
 * HMAC SHA256(order_id + "|" + payment_id, secret)
 */
export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
  const hmac = crypto.createHmac('sha256', PAYMENT_KEY_SECRET);
  hmac.update(`${orderId}|${paymentId}`);
  const expectedSignature = hmac.digest('hex');
  return expectedSignature === signature;
};

/**
 * Verifies Razorpay webhook signature
 */
export const verifyWebhookSignature = (rawBody, signature) => {
  if (!PAYMENT_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', PAYMENT_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');
  return expectedSignature === signature;
};
