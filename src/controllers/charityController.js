import { BlockchainService } from '../services/blockchainService.js';

export class CharityController {
  /**
   * GET /api/charities
   * Returns all verified charities from CharityRegistry.sol
   */
  static async getAllCharities(req, res, next) {
    try {
      const charities = await BlockchainService.getAllCharities();
      res.status(200).json({
        success: true,
        count: charities.length,
        charities,
      });
    } catch (err) {
      next(err);
    }
  }
}
