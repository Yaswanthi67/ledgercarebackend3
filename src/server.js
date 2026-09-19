import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import paymentRoutes from './routes/paymentRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import donationRoutes from './routes/donationRoutes.js';
import evidenceRoutes from './routes/evidenceRoutes.js';
import charityRoutes from './routes/charityRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { BlockchainService } from './services/blockchainService.js';
import { hasIpfsCredentials } from './config/ipfs.js';
import { PAYMENT_KEY_ID } from './config/payment.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate frontend dist directory
const frontendDistPath = path.resolve(__dirname, '../../LedgerCareFrontend/dist');
const localPublicPath = path.resolve(__dirname, '../public');
const staticPath = fs.existsSync(frontendDistPath)
  ? frontendDistPath
  : (fs.existsSync(localPublicPath) ? localPublicPath : null);

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// CORS configuration - Allow all local frontend dev servers (ports 3000, 5173, etc.)
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount static files if frontend dist exists
if (staticPath) {
  app.use(express.static(staticPath));
}

// Fallback landing page if frontend is not yet built
app.get('/', (req, res, next) => {
  if (staticPath && fs.existsSync(path.join(staticPath, 'index.html'))) {
    return res.sendFile(path.join(staticPath, 'index.html'));
  }

  if (req.accepts('html')) {
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LedgerCare Backend API</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1120; color: #f8fafc; padding: 2rem; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 600px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; background: #065f46; color: #34d399; margin-bottom: 1rem; }
          h1 { margin-top: 0; font-size: 1.75rem; color: #ffffff; }
          p { color: #94a3b8; line-height: 1.5; }
          ul { list-style: none; padding: 0; margin: 1.5rem 0; }
          li { padding: 0.6rem 0; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; }
          a { color: #60a5fa; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
          .btn { display: inline-block; background: #3b82f6; color: #fff; padding: 0.75rem 1.25rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 1rem; }
          .btn:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● Online &amp; Ready</div>
          <h1>LedgerCare Backend API</h1>
          <p>The backend relayer, UPI payment gateway, and IPFS bridge is running smoothly.</p>
          <ul>
            <li><span>Frontend UI:</span> <a href="http://localhost:3000" target="_blank">http://localhost:3000</a></li>
            <li><span>Health Check:</span> <a href="/api/health">/api/health</a></li>
            <li><span>Campaigns API:</span> <a href="/api/campaigns">/api/campaigns</a></li>
            <li><span>Platform Stats:</span> <a href="/api/stats">/api/stats</a></li>
            <li><span>Donations API:</span> <a href="/api/donations">/api/donations</a></li>
            <li><span>Charities API:</span> <a href="/api/charities">/api/charities</a></li>
          </ul>
          <a href="http://localhost:3000" class="btn">Open Frontend Application →</a>
        </div>
      </body>
      </html>
    `);
  }

  res.status(200).json({
    success: true,
    service: 'LedgerCare Backend API',
    status: 'running',
    health: '/api/health',
    campaigns: '/api/campaigns',
    stats: '/api/stats',
    donations: '/api/donations',
    charities: '/api/charities',
  });
});

// Health check endpoint (Requirement 30)
app.get('/api/health', async (req, res) => {
  const blockchainHealth = await BlockchainService.getHealth();

  res.status(200).json({
    success: true,
    service: 'LedgerCare Backend',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    blockchain: {
      connected: blockchainHealth.connected,
      chainId: blockchainHealth.chainId,
      backendSigner: blockchainHealth.signerAddress,
      balanceEth: blockchainHealth.signerBalanceEth,
    },
    paymentGateway: {
      provider: 'Razorpay',
      mode: 'TEST/SANDBOX',
      keyId: PAYMENT_KEY_ID.substring(0, 8) + '...',
    },
    ipfs: {
      provider: 'Pinata IPFS',
      configured: hasIpfsCredentials(),
    },
  });
});

// Platform Stats endpoint
app.get('/api/stats', async (req, res, next) => {
  try {
    const [campaigns, charities] = await Promise.all([
      BlockchainService.getAllCampaigns(),
      BlockchainService.getAllCharities(),
    ]);

    let totalRaisedEth = 0;
    let totalWithdrawnEth = 0;
    let activeCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    campaigns.forEach((c) => {
      totalRaisedEth += parseFloat(c.raisedAmountEth || '0');
      totalWithdrawnEth += parseFloat(c.withdrawnAmountEth || '0');
      if (c.status === 0) activeCount++;
      else if (c.status === 1) completedCount++;
      else if (c.status === 2) cancelledCount++;
    });

    res.status(200).json({
      success: true,
      stats: {
        totalCampaigns: campaigns.length,
        activeCampaigns: activeCount,
        completedCampaigns: completedCount,
        cancelledCampaigns: cancelledCount,
        totalRaisedEth: totalRaisedEth.toString(),
        totalWithdrawnEth: totalWithdrawnEth.toString(),
        verifiedCharitiesCount: charities.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// API Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/charities', charityRoutes);

// 404 handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.baseUrl} not found.`,
  });
});

// SPA client-side fallback for all frontend web routes (e.g. /campaigns, /donor, /verify)
if (staticPath && fs.existsSync(path.join(staticPath, 'index.html'))) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// Centralized error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  LedgerCare Backend Running`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`  Allowed Frontend: ${FRONTEND_URL}`);
  console.log(`========================================`);
});

export default app;
