import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'ledgercare_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class DatabaseService {
  constructor() {
    this.records = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.records = JSON.parse(raw);
      } else {
        this.records = [];
        this.save();
      }
    } catch (err) {
      console.warn('Failed to load DB file, initializing empty database:', err);
      this.records = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.records, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save DB file:', err);
    }
  }

  /**
   * Creates a new pending donation record
   */
  createOrder({ orderId, campaignId, amountInr, amountEth, donorName, donorEmail, donorPhone }) {
    // Check if order already exists
    const existing = this.records.find((r) => r.orderId === orderId);
    if (existing) return existing;

    const newRecord = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderId,
      paymentId: null,
      signature: null,
      campaignId: Number(campaignId),
      donorName: donorName.trim(),
      donorEmail: donorEmail ? donorEmail.trim() : null,
      donorPhone: donorPhone ? donorPhone.trim() : null,
      amountInr: Number(amountInr),
      amountEth: Number(amountEth),
      paymentStatus: 'PENDING', // PENDING | PAID | FAILED | REFUNDED
      blockchainStatus: 'NOT_STARTED', // NOT_STARTED | SUBMITTED | CONFIRMING | CONFIRMED | FAILED
      transactionHash: null,
      blockchainDonationId: null,
      ipfsCid: null,
      errorMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.records.push(newRecord);
    this.save();
    return newRecord;
  }

  getOrderByOrderId(orderId) {
    return this.records.find((r) => r.orderId === orderId) || null;
  }

  getPaymentByPaymentId(paymentId) {
    return this.records.find((r) => r.paymentId === paymentId) || null;
  }

  getRecordById(id) {
    return this.records.find((r) => r.id === id || r.orderId === id || r.paymentId === id) || null;
  }

  /**
   * Updates payment status
   */
  updatePaymentStatus(orderId, paymentStatus, paymentId = null, signature = null) {
    const record = this.records.find((r) => r.orderId === orderId);
    if (!record) return null;

    record.paymentStatus = paymentStatus;
    if (paymentId) record.paymentId = paymentId;
    if (signature) record.signature = signature;
    record.updatedAt = Date.now();
    this.save();
    return record;
  }

  /**
   * Updates blockchain submission & confirmation state
   */
  updateBlockchainStatus(orderId, { blockchainStatus, transactionHash, blockchainDonationId, errorMessage, ipfsCid }) {
    const record = this.records.find((r) => r.orderId === orderId);
    if (!record) return null;

    if (blockchainStatus !== undefined) record.blockchainStatus = blockchainStatus;
    if (transactionHash !== undefined) record.transactionHash = transactionHash;
    if (blockchainDonationId !== undefined) record.blockchainDonationId = blockchainDonationId;
    if (errorMessage !== undefined) record.errorMessage = errorMessage;
    if (ipfsCid !== undefined) record.ipfsCid = ipfsCid;

    record.updatedAt = Date.now();
    this.save();
    return record;
  }

  getAllDonations(filter = {}) {
    let list = [...this.records];
    if (filter.campaignId) {
      list = list.filter((r) => Number(r.campaignId) === Number(filter.campaignId));
    }
    if (filter.donorEmail) {
      list = list.filter((r) => r.donorEmail && r.donorEmail.toLowerCase() === filter.donorEmail.toLowerCase());
    }
    if (filter.paymentStatus) {
      list = list.filter((r) => r.paymentStatus === filter.paymentStatus);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ==========================================
  // CAMPAIGNS PERSISTENCE
  // ==========================================
  getCampaignsFile() {
    return path.join(DATA_DIR, 'campaigns.json');
  }

  getAllCampaigns() {
    try {
      const file = this.getCampaignsFile();
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed reading campaigns.json:', e);
    }
    return [];
  }

  saveCampaign(campaign) {
    try {
      const file = this.getCampaignsFile();
      const list = this.getAllCampaigns();
      const idx = list.findIndex((c) => Number(c.campaignId) === Number(campaign.campaignId));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...campaign };
      } else {
        list.push(campaign);
      }
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
      return campaign;
    } catch (e) {
      console.error('Failed saving campaign:', e);
      return campaign;
    }
  }

  // ==========================================
  // CHARITIES PERSISTENCE
  // ==========================================
  getCharitiesFile() {
    return path.join(DATA_DIR, 'charities.json');
  }

  getAllCharities() {
    try {
      const file = this.getCharitiesFile();
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed reading charities.json:', e);
    }
    return [];
  }

  saveCharity(charity) {
    try {
      const file = this.getCharitiesFile();
      const list = this.getAllCharities();
      const idx = list.findIndex(
        (c) =>
          Number(c.charityId) === Number(charity.charityId) ||
          c.registrationNumber === charity.registrationNumber
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...charity };
      } else {
        list.push(charity);
      }
      fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
      return charity;
    } catch (e) {
      console.error('Failed saving charity:', e);
      return charity;
    }
  }
}

export const db = new DatabaseService();
