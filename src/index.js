const express = require('express');
const { Connection, PublicKey, LAMPORTS } = require('@solana/web3.js');
const axios = require('axios');
const cors = require('cors');

const auth = require('./auth/auth');
const wallet = require('./wallet/wallet');
const tradingBot = require('./bot/botObject');
const tradeSimulator = require('./bot/simulate');

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
  const { wallet: walletAddress, privateKey, config } = req.body;

  if (!walletAddress || !privateKey) {
    return res.status(400).send("Faltam dados obrigatórios (wallet e privateKey).");
  }

  const valid = auth.validatePrivateKey(privateKey, walletAddress);
  if (!valid) {
    return res.status(403).send("PrivateKey não corresponde à carteira.");
  }

  const started = tradingBot.createBot(walletAddress, config);
  if (started) {
    res.json({
      message: `Bot da carteira ${walletAddress} iniciado com sucesso!`,
      config: tradingBot.getBotStatus(walletAddress).config
    });
  } else {
    res.status(400).json({
      error: `Bot da carteira ${walletAddress} já está rodando.`
    });
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

// Rota para obter tokens descobertos
app.get('/discovered-tokens/:wallet', async (req, res) => {
  const { wallet } = req.params;
  
  try {
    const discoveredTokens = await tradingBot.getDiscoveredTokens(wallet);
    res.json(discoveredTokens);
  } catch (err) {
    res.status(500).json({
      error: 'Erro ao buscar tokens descobertos',
      details: err.message
    });
  }
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

// Rota para iniciar simulação
app.get('/start-simulating', (req, res) => {
  const started = tradingBot.startSimulatingTrades();
  if (started) {
    res.json({ message: 'Simulação iniciada com sucesso!' });
  } else {
    res.status(400).json({ error: 'Simulação já está em andamento.' });
  }
});

// Rota para parar simulação
app.get('/stop-simulating', (req, res) => {
  const stopped = tradingBot.stopSimulatingTrades();
  if (stopped) {
    res.json({ message: 'Simulação parada com sucesso!' });
  } else {
    res.status(400).json({ error: 'Simulação não estava em andamento.' });
  }
});

// Rota para obter trades simulados
app.get('/simulated-trades', (req, res) => {
  const trades = tradingBot.getSimulatedTrades();
  res.json(trades);
});

// Inicializa o servidor
app.listen(port, () => {
  console.log(`🚀 Bot ativo em http://localhost:${port}`);
}); 