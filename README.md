# LedgerCare Backend Service

> Secure bridge between Indian UPI / Payment Gateway (Razorpay), IPFS Decentralized Storage, and Ethereum Smart Contracts for the LedgerCare Transparent Charity Management System.

---

## Features

- **Walletless Donor Experience**: Donors contribute in Indian Rupees (INR) via UPI (Google Pay, PhonePe, Paytm, BHIM, QR code) without needing MetaMask, Web3 wallet extensions, or crypto keys.
- **Server-Side Payment Verification**: Cryptographic HMAC-SHA256 signature verification and payment status confirmation with payment provider before any blockchain interaction.
- **Backend Blockchain Relayer**: Uses a dedicated server-side wallet to execute `DonationLedger.donate(campaignId, { value })` on behalf of donors.
- **Idempotency & Duplicate Protection**: Guards against duplicate payments and duplicate blockchain submissions.
- **INR to Native Currency Conversion**: Transparent, configurable conversion rate (`INR_TO_ETH_RATE`) ensuring clarity between INR donated and Wei recorded on-chain.
- **IPFS Evidence Storage & Verification**: Files (invoices, receipts, documents) are hashed with deterministic Keccak-256 and pinned to IPFS, returning verifiable CIDs and on-chain verification.
- **Audit Ledger**: Comprehensive audit logging and synchronized donation history matching on-chain events.

---

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Blockchain SDK**: ethers.js v6
- **Payment Gateway**: Razorpay Node SDK (Sandbox / Test Mode)
- **IPFS**: Pinata Pinning API / Gateway
- **Persistence**: File-backed atomic JSON store (`data/ledgercare_db.json`) with MongoDB connectivity support

---

## Installation & Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- Hardhat node running locally (`127.0.0.1:8545`) or Sepolia testnet RPC

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your parameters in `.env`:
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Blockchain
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CHAIN_ID=31337

# Deployed Contract Addresses
CHARITY_REGISTRY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
CAMPAIGN_MANAGER_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
DONATION_LEDGER_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
FUND_EVIDENCE_TRACKER_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9

# INR to Native Currency Conversion Rate (1 ETH = ₹250,000 INR => ₹500 = 0.002 ETH)
INR_TO_ETH_RATE=0.000004

# Payment Gateway (Razorpay Test Keys)
PAYMENT_KEY_ID=rzp_test_your_key_id
PAYMENT_KEY_SECRET=your_key_secret
PAYMENT_WEBHOOK_SECRET=your_webhook_secret

# IPFS Pinning (Pinata API)
IPFS_API_KEY=your_pinata_key
IPFS_API_SECRET=your_pinata_secret
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
```

---

## Starting the Server

### Development mode:
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

---

## API Endpoints

### 1. System Health
- **`GET /api/health`**
  - Returns backend status, blockchain connectivity, backend signer address, balance, and gateway mode.

### 2. Campaigns
- **`GET /api/campaigns`**
  - Returns all campaigns queried from `CampaignManager.sol`.
- **`GET /api/campaigns/:id`**
  - Returns campaign details and associated charity profile.
- **`GET /api/campaigns/:id/donations`**
  - Returns on-chain donations augmented with off-chain INR payment data.
- **`GET /api/campaigns/:id/usages`**
  - Returns fund usages and cryptographic evidence hashes from `FundEvidenceTracker.sol`.

### 3. Payments & Donations (UPI Flow)
- **`POST /api/payments/create-order`**
  - Validates campaign on-chain.
  - Converts INR amount to blockchain amount.
  - Creates a Razorpay order in INR.
  - Body:
    ```json
    {
      "campaignId": 1,
      "amount": 500,
      "donorName": "Aarav Sharma",
      "donorEmail": "aarav@example.com",
      "donorPhone": "9876543210"
    }
    ```
- **`POST /api/payments/verify`**
  - Server-side cryptographic HMAC-SHA256 signature verification.
  - Calls `DonationLedger.donate(campaignId, { value: ethAmount })`.
  - Confirms transaction on blockchain.
  - Body:
    ```json
    {
      "razorpay_order_id": "order_xxx",
      "razorpay_payment_id": "pay_xxx",
      "razorpay_signature": "sig_xxx"
    }
    ```
- **`POST /api/payments/webhook`**
  - Secure webhook endpoint for async capture confirmation.

### 4. Donations & Records
- **`GET /api/donations`**
  - List all donations with payment status and blockchain status.
- **`GET /api/donations/:id`**
  - Single donation lookup.
- **`POST /api/donations/:id/retry`**
  - Safely retries blockchain relay for a payment that succeeded if the initial transaction reverted.

### 5. IPFS Evidence & Verification
- **`POST /api/evidence/upload`**
  - Accepts multipart `file`.
  - Calculates Keccak-256 hash.
  - Pins file to IPFS and returns CID.
- **`POST /api/evidence/verify`**
  - Accepts multipart `file` and `usageId` or `expectedHash`.
  - Compares computed Keccak-256 hash with on-chain stored hash.
  - Returns `{ verified: true/false, message, computedHash, recordedHash }`.

### 6. Charities
- **`GET /api/charities`**
  - Returns verified charities from `CharityRegistry.sol`.

---

## Security Best Practices
- **No Private Keys on Frontend**: The backend relayer private key and gateway secrets reside strictly in the backend `.env`.
- **Idempotency Guard**: Re-sending identical payment details returns the existing confirmed transaction without executing another blockchain donation.
- **Centralized Error Sanitization**: Smart contract revert reasons are cleanly parsed without leaking sensitive stack traces or internal environment variables.
