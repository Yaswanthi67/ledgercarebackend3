import dotenv from 'dotenv';
dotenv.config();

export const IPFS_API_KEY = process.env.IPFS_API_KEY;
export const IPFS_API_SECRET = process.env.IPFS_API_SECRET;
export const IPFS_JWT = process.env.IPFS_JWT;
export const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';

export const hasIpfsCredentials = () => {
  return Boolean(IPFS_JWT || (IPFS_API_KEY && IPFS_API_SECRET));
};
