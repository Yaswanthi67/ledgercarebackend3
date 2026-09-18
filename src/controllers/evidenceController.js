import { IpfsService } from '../services/ipfsService.js';

export class EvidenceController {
  /**
   * POST /api/evidence/upload
   * Receives an evidence file, computes its Keccak-256 hash, and pins it to IPFS
   */
  static async uploadEvidence(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No evidence file uploaded. Please provide a valid file.',
        });
      }

      const result = await IpfsService.uploadEvidence(req.file);

      res.status(200).json({
        success: true,
        cid: result.cid,
        url: result.url,
        evidenceHash: result.evidenceHash,
        fileName: result.fileName,
        fileSize: result.fileSize,
        mimeType: result.mimeType,
        message: 'Evidence document pinned to IPFS and cryptographic hash computed.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/evidence/verify
   * Verifies an evidence file against the on-chain hash
   */
  static async verifyEvidence(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload the evidence file to verify.',
        });
      }

      const { usageId, expectedHash } = req.body;

      if (!usageId && !expectedHash) {
        return res.status(400).json({
          success: false,
          message: 'Please provide either usageId or expectedHash in the request.',
        });
      }

      const result = await IpfsService.verifyEvidence({
        file: req.file,
        usageId,
        expectedHash,
      });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
}
