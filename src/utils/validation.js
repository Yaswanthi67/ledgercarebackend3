/**
 * Validation utilities for API inputs
 */

export const validateCreateOrderInput = ({ campaignId, amount, donorName, donorEmail, donorPhone }) => {
  const errors = [];

  const cId = parseInt(campaignId, 10);
  if (isNaN(cId) || cId <= 0) {
    errors.push('Valid campaignId is required.');
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    errors.push('Donation amount must be greater than zero.');
  }

  if (!donorName || typeof donorName !== 'string' || donorName.trim().length === 0) {
    errors.push('donorName is required.');
  }

  if (donorEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(donorEmail.trim())) {
      errors.push('Invalid donorEmail format.');
    }
  }

  if (donorPhone) {
    const cleanPhone = donorPhone.replace(/[\s+-]/g, '');
    if (cleanPhone.length < 10) {
      errors.push('donorPhone must be at least 10 digits.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validateVerifyPaymentInput = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const errors = [];

  if (!razorpay_order_id) errors.push('razorpay_order_id is required.');
  if (!razorpay_payment_id) errors.push('razorpay_payment_id is required.');
  if (!razorpay_signature) errors.push('razorpay_signature is required.');

  return {
    isValid: errors.length === 0,
    errors,
  };
};
