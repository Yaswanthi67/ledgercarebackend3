import axios from 'axios';
import FormData from 'form-data';
import { computeBufferKeccak256 } from '../utils/hash.js';
import {
  IPFS_API_KEY,
  IPFS_API_SECRET,
  IPFS_JWT,
  IPFS_GATEWAY,
  hasIpfsCredentials,
} from '../config/ipfs.js';
import { BlockchainService } from './blockchainService.js';
import crypto from 'crypto';

export class IpfsService {
  /**
   * Uploads an evidence file to IPFS (via Pinata) and calculates its Keccak-256 hash
   */
  static async uploadEvidence(file) {
    if (!file || !file.buffer) {
      throw new Error('No file provided for IPFS upload.');
    }

    // 1. Calculate cryptographic Keccak-256 hash matching Solidity
    const evidenceHash = computeBufferKeccak256(file.buffer);

    let cid = null;

    // 2. If Pinata credentials are provided, pin file to IPFS
    if (hasIpfsCredentials()) {
      try {
        const formData = new FormData();
        formData.append('file', file.buffer, {
          filename: file.originalname || 'evidence_document',
          contentType: file.mimetype,
        });

        const metadata = JSON.stringify({
          name: `ledgercare_${Date.now()}_${file.originalname || 'file'}`,
          keyvalues: {
            evidenceHash,
            uploadedAt: Date.now().toString(),
          },
        });
        formData.append('pinataMetadata', metadata);

        const headers = formData.getHeaders();
        if (IPFS_JWT) {
          headers['Authorization'] = `Bearer ${IPFS_JWT}`;
        } else {
          headers['pinata_api_key'] = IPFS_API_KEY;
          headers['pinata_secret_api_key'] = IPFS_API_SECRET;
        }

        const response = await axios.post(
          'https://api.pinata.cloud/pinning/pinFileToIPFS',
          formData,
          {
            headers,
            maxContentLength: 50 * 1024 * 1024,
          }
        );

        if (response.data && response.data.IpfsHash) {
          cid = response.data.IpfsHash;
        }
      } catch (err) {
        console.error('Pinata IPFS pinning error:', err.response?.data || err.message);
        throw new Error(
          `IPFS upload failed: ${err.response?.data?.error?.details || err.message}`
        );
      }
    } else {
      // For local development when external IPFS keys are not configured:
      // Generate a deterministic IPFS v0 CID based on SHA-256 of file buffer
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      cid = `Qm${sha256.substring(0, 44)}`;
    }

    return {
      success: true,
      cid,
      url: `${IPFS_GATEWAY}${cid}`,
      evidenceHash,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Verifies an uploaded file against on-chain hash or provided expected hash
   */
  static async verifyEvidence({ file, usageId, expectedHash }) {
    if (!file || !file.buffer) {
      throw new Error('No file provided for verification.');
    }

    // 1. Locally compute Keccak-256 hash of provided file
    const computedHash = computeBufferKeccak256(file.buffer);

    let targetHash = expectedHash;

    // 2. If usageId is provided, query the smart contract for the on-chain hash
    if (usageId) {
      const onChainHash = await BlockchainService.getEvidenceHash(usageId);
      if (!onChainHash || onChainHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error(`Fund usage record #${usageId} has no valid on-chain evidence hash.`);
      }
      targetHash = onChainHash;
    }

    if (!targetHash) {
      throw new Error('Either usageId or expectedHash must be provided for verification.');
    }

    // 3. Compare computed hash with target on-chain hash
    const isMatch = computedHash.toLowerCase() === targetHash.toLowerCase();

    return {
      verified: isMatch,
      message: isMatch
        ? 'Evidence verified successfully! Cryptographic hash matches the on-chain record.'
        : 'Evidence does not match the recorded hash. The file may have been altered or tampered with.',
      computedHash,
      recordedHash: targetHash,
      usageId: usageId ? Number(usageId) : null,
    };
  }
}
