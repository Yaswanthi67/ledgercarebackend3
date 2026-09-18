import { ethers } from 'ethers';

/**
 * Computes deterministic Keccak-256 hash of a file buffer or Uint8Array.
 * Matches Solidity keccak256() exactly.
 * @param {Buffer | Uint8Array} buffer
 * @returns {string} bytes32 hex string starting with 0x
 */
export const computeBufferKeccak256 = (buffer) => {
  if (!buffer) throw new Error('Cannot hash empty or null buffer');
  const uint8 = new Uint8Array(buffer);
  return ethers.keccak256(uint8);
};

/**
 * Computes charity credential hash
 * keccak256(abi.encode(organizationName, registrationNumber, email, wallet))
 */
export const computeCredentialHash = (orgName, regNo, email, wallet) => {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const encoded = abiCoder.encode(
    ['string', 'string', 'string', 'address'],
    [orgName.trim(), regNo.trim(), email.trim(), wallet.trim()]
  );
  return ethers.keccak256(encoded);
};
