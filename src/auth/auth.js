const { Keypair } = require('@solana/web3.js');

function validatePrivateKey(privateKeyArray, expectedPublicKey) {
  try {
    const secretKey = Uint8Array.from(privateKeyArray);
    const keypair = Keypair.fromSecretKey(secretKey);
    return keypair.publicKey.toBase58() === expectedPublicKey;
  } catch (err) {
    return false;
  }
}

function getKeypairFromPrivateKey(privateKeyArray) {
  try {
    const secretKey = Uint8Array.from(privateKeyArray);
    return Keypair.fromSecretKey(secretKey);
  } catch (err) {
    throw new Error('Chave privada inválida');
  }
}

module.exports = {
  validatePrivateKey,
  getKeypairFromPrivateKey
}; 