import crypto from 'crypto';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('  LEDGERCARE END-TO-END INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name}`);
      failed++;
    }
  }

  // 1. Health Check
  console.log('1. Health Check:');
  const healthRes = await fetch(`${API_BASE}/health`).then((r) => r.json());
  assert(healthRes.success === true, 'Health check returns success: true');
  assert(healthRes.blockchain?.connected === true, 'Blockchain connected to Hardhat node');
  assert(healthRes.paymentGateway?.mode === 'TEST/SANDBOX', 'Payment gateway is in TEST/SANDBOX mode');
  console.log(`     Signer Address: ${healthRes.blockchain.backendSigner}`);
  console.log(`     Signer Balance: ${healthRes.blockchain.balanceEth} ETH\n`);

  // 2. Query Campaigns
  console.log('2. Query Campaigns:');
  const campRes = await fetch(`${API_BASE}/campaigns`).then((r) => r.json());
  assert(campRes.success === true && campRes.campaigns.length > 0, 'Campaigns retrieved from smart contracts');
  const targetCamp = campRes.campaigns[0];
  console.log(`     Campaign #${targetCamp.campaignId}: "${targetCamp.title}"`);
  console.log(`     Target: ${targetCamp.targetAmountEth} ETH | Raised: ${targetCamp.raisedAmountEth} ETH\n`);

  // 3. Create UPI Payment Order
  console.log('3. Create UPI Payment Order (₹1000 INR):');
  const orderRes = await fetch(`${API_BASE}/payments/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: targetCamp.campaignId,
      amount: 1000,
      donorName: 'Priya Patel',
      donorEmail: 'priya@example.com',
      donorPhone: '9820098200',
    }),
  }).then((r) => r.json());

  assert(orderRes.success === true, 'Order created successfully');
  assert(orderRes.amountInr === 1000, 'INR amount is 1000');
  assert(orderRes.ethAmount === 0.004, 'ETH equivalent is 0.004 ETH (Demo rate)');
  assert(orderRes.orderId.startsWith('order_'), 'Valid order ID generated');
  console.log(`     Order ID: ${orderRes.orderId}\n`);

  // 4. Server-Side Payment Verification & Blockchain Donation
  console.log('4. Payment Verification & On-Chain Relaying:');
  const paymentId = 'pay_test_' + Date.now();
  const secret = 'demo_secret_key_ledgercare_9988';
  const sig = crypto.createHmac('sha256', secret).update(`${orderRes.orderId}|${paymentId}`).digest('hex');

  const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderRes.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sig,
    }),
  }).then((r) => r.json());

  assert(verifyRes.success === true, 'Payment verified successfully');
  assert(verifyRes.paymentStatus === 'paid', 'Payment status is paid');
  assert(verifyRes.blockchainStatus === 'confirmed', 'Blockchain status is confirmed');
  assert(Boolean(verifyRes.transactionHash), 'Transaction hash received from smart contract');
  console.log(`     Transaction Hash: ${verifyRes.transactionHash}`);
  console.log(`     Block Number: ${verifyRes.blockNumber}`);
  console.log(`     Smart Contract Donation ID: #${verifyRes.donationId}\n`);

  // 5. Idempotency Check (Duplicate Payment Protection)
  console.log('5. Idempotency Check:');
  const duplicateRes = await fetch(`${API_BASE}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderRes.orderId,
      razorpay_payment_id: 'duplicate_attempt',
      razorpay_signature: 'fake_sig',
    }),
  }).then((r) => r.json());

  assert(duplicateRes.success === true, 'Duplicate call handled gracefully');
  assert(duplicateRes.alreadyProcessed === true, 'Duplicate payment flagged as alreadyProcessed');
  assert(duplicateRes.transactionHash === verifyRes.transactionHash, 'Returned existing transaction hash');
  console.log(`     Duplicate submission successfully rejected without creating duplicate donation.\n`);

  // 6. IPFS Evidence Upload
  console.log('6. IPFS Evidence Upload:');
  const receiptContent = `LedgerCare Official Expenditure Proof: School Uniforms purchased on ${new Date().toISOString()}`;
  const form = new FormData();
  form.append('file', new Blob([receiptContent], { type: 'text/plain' }), 'invoice_uniforms.txt');

  const uploadRes = await fetch(`${API_BASE}/evidence/upload`, {
    method: 'POST',
    body: form,
  }).then((r) => r.json());

  assert(uploadRes.success === true, 'Evidence uploaded to IPFS');
  assert(Boolean(uploadRes.cid), 'IPFS CID returned');
  assert(Boolean(uploadRes.evidenceHash), 'Keccak-256 evidence hash calculated');
  console.log(`     IPFS CID: ${uploadRes.cid}`);
  console.log(`     Evidence Hash: ${uploadRes.evidenceHash}\n`);

  // 7. IPFS Evidence Verification
  console.log('7. IPFS Evidence Verification:');
  const verifyForm = new FormData();
  verifyForm.append('file', new Blob([receiptContent], { type: 'text/plain' }), 'invoice_uniforms.txt');
  verifyForm.append('expectedHash', uploadRes.evidenceHash);

  const matchRes = await fetch(`${API_BASE}/evidence/verify`, {
    method: 'POST',
    body: verifyForm,
  }).then((r) => r.json());

  assert(matchRes.success === true && matchRes.verified === true, 'Authentic file hash verified against record');

  // Tampered file check
  const tamperedForm = new FormData();
  tamperedForm.append('file', new Blob(['TAMPERED EVIDENCE CONTENT'], { type: 'text/plain' }), 'tampered.txt');
  tamperedForm.append('expectedHash', uploadRes.evidenceHash);

  const mismatchRes = await fetch(`${API_BASE}/evidence/verify`, {
    method: 'POST',
    body: tamperedForm,
  }).then((r) => r.json());

  assert(mismatchRes.success === true && mismatchRes.verified === false, 'Tampered file hash correctly identified as mismatch');
  console.log(`     Cryptographic tampering detection verified.\n`);

  // 8. Public Donation History
  console.log('8. Public Donation History:');
  const historyRes = await fetch(`${API_BASE}/donations`).then((r) => r.json());
  assert(historyRes.success === true && historyRes.donations.length >= 2, 'Donations list contains verified records');
  const latestDonation = historyRes.donations[0];
  console.log(`     Latest Donor: ${latestDonation.donorName} | ₹${latestDonation.amountInr} INR (${latestDonation.amountEth} ETH)`);
  console.log(`     Payment: ${latestDonation.paymentStatus} | Blockchain: ${latestDonation.blockchainStatus}\n`);

  // Summary
  console.log('====================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
