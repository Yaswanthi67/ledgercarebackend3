/**
 * Centralized error handling middleware.
 * Ensures clean user-facing error messages without leaking secrets, private keys, or stack traces.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Server error:', err.message || err);

  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'An internal server error occurred.';

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum allowable limit of 20MB.';
    }
  }

  // Handle ethers / Solidity revert errors
  if (err.reason) {
    message = `Smart Contract Revert: ${err.reason}`;
    statusCode = 400;
  } else if (err.shortMessage) {
    message = err.shortMessage;
    statusCode = 400;
  }

  // Sanitize message to never expose private keys or secrets
  message = message.replace(/0x[a-fA-F0-9]{64}/g, '0x[REDACTED]');
  message = message.replace(/secret_[a-zA-Z0-9_-]+/g, '[REDACTED_SECRET]');

  res.status(statusCode).json({
    success: false,
    message,
  });
};
