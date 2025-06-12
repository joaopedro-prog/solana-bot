const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

function generateWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64'),
  };
}

function saveWalletToFile(wallet) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `wallet-${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(wallet, null, 2));
  return filename;
}

async function requestAirdrop(connection, publicKey) {
  const pubKey = new PublicKey(publicKey);
  const signature = await connection.requestAirdrop(pubKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature);
  return signature;
}

module.exports = {
  generateWallet,
  saveWalletToFile,
  requestAirdrop
}; 