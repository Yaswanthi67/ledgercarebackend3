import express from 'express';
import { CampaignController } from '../controllers/campaignController.js';

const router = express.Router();

router.get('/', CampaignController.getAllCampaigns);
router.post('/', CampaignController.createCampaign);
router.get('/:id', CampaignController.getCampaignById);
router.get('/:id/donations', CampaignController.getCampaignDonations);
router.get('/:id/usages', CampaignController.getCampaignUsages);

export default router;
