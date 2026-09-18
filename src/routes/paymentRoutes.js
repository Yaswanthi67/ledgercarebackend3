import express from 'express';
import { PaymentController } from '../controllers/paymentController.js';

const router = express.Router();

router.post('/create-order', PaymentController.createOrder);
router.post('/verify', PaymentController.verifyPayment);
router.post('/webhook', PaymentController.handleWebhook);

export default router;
