const express = require('express');
const { Connection, PublicKey, LAMPORTS } = require('@solana/web3.js');
const axios = require('axios');
const cors = require('cors');

const auth = require('./auth/auth');
const wallet = require('./wallet/wallet');
const tradingBot = require('./bot/bot');

const app = express();
const port = process.env.PORT || 3000;

// Configuração otimizada do CORS
app.use(cors());

app.use(express.json());

// Rota para criar carteira
app.get('/create-wallet', (req, res) => {
  const newWallet = wallet.generateWallet();
  const filename = wallet.saveWalletToFile(newWallet);

  res.json({
    message: '✅ Carteira Solana criada com sucesso!',
    wallet: newWallet,
    filename
  });
});

// Rota para solicitar airdrop na devnet
app.post('/airdrop', async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: '🔑 Você precisa enviar uma publicKey no corpo da requisição.' });
    }

    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const signature = await wallet.requestAirdrop(connection, publicKey);

    res.json({
      message: '🚀 Airdrop de 1 SOL enviado com sucesso!',
      publicKey,
      txSignature: signature
    });

  } catch (err) {
    res.status(500).json({ error: '❌ Erro ao solicitar airdrop.', details: err.message });
  }
});

// Rota para iniciar o bot
app.post('/start-trading', (req, res) => {
  const { wallet: walletAddress, privateKey, tokenMint } = req.body;

  if (!walletAddress || !privateKey || !tokenMint) {
    return res.status(400).send("Faltam dados.");
  }

  const valid = auth.validatePrivateKey(privateKey, walletAddress);
  if (!valid) {
    return res.status(403).send("PrivateKey não corresponde à carteira.");
  }

  const started = tradingBot.createBot(walletAddress, tokenMint);
  if (started) {
    res.send(`Bot da carteira ${walletAddress} iniciado com sucesso!`);
  } else {
    res.send(`Bot da carteira ${walletAddress} já está rodando.`);
  }
});

// Rota para parar o bot
app.post('/stop-trading', (req, res) => {
  const { wallet: walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).send("Faltando endereço da carteira");
  }

  const stopped = tradingBot.stopBot(walletAddress);
  if (stopped) {
    res.send(`Bot da carteira ${walletAddress} parado.`);
  } else {
    res.send(`Bot da carteira ${walletAddress} não estava rodando.`);
  }
});

// Rota para verificar status do bot
app.get('/status/:wallet', (req, res) => {
  const { wallet } = req.params;
  const status = tradingBot.getBotStatus(wallet);
  res.send(status);
});

// Rota para monitorar preço
app.get('/monitor-price', async (req, res) => {
  const { tokenMint } = req.query;

  if (!tokenMint) {
    return res.status(400).json({ error: 'Você precisa fornecer o mint address do token (tokenMint).' });
  }

  try {
    const priceInfo = await tradingBot.getTokenPrice(tokenMint);
    res.json(priceInfo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar preço.', details: err.message });
  }
});

// Inicializa o servidor
app.listen(port, () => {
  console.log(`🚀 Bot ativo em http://localhost:${port}`);
}); 