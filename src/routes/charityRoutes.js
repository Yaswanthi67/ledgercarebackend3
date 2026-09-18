import express from 'express';
import { CharityController } from '../controllers/charityController.js';

const router = express.Router();

router.get('/', CharityController.getAllCharities);

export default router;
