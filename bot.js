const express = require('express');
const solanaWeb3 = require('@solana/web3.js');
const fs = require('fs');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;


// Cada usuário terá um bot com estado próprio
const bots = {}; // chave: userId → valor: { interval, started }

app.use(express.json()); // permite receber JSON no body

// Geração de carteira
function generateWallet() {
  const keypair = solanaWeb3.Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64'),
  };
}

// Rota para criar carteira
app.get('/create-wallet', (req, res) => {
  const wallet = generateWallet();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`wallet-${timestamp}.json`, JSON.stringify(wallet, null, 2));

  res.json({
    message: '✅ Carteira Solana criada com sucesso!',
    wallet
  });
});

// Rota para solicitar airdrop na devnet
app.post('/airdrop', async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: '🔑 Você precisa enviar uma publicKey no corpo da requisição.' });
    }

    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    const pubKey = new solanaWeb3.PublicKey(publicKey);

    const signature = await connection.requestAirdrop(pubKey, solanaWeb3.LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);

    res.json({
      message: '🚀 Airdrop de 1 SOL enviado com sucesso!',
      publicKey,
      txSignature: signature
    });

  } catch (err) {
    res.status(500).json({ error: '❌ Erro ao solicitar airdrop.', details: err.message });
  }
});

app.post('/swap-memecoin', async (req, res) => {
  const { fromToken, toToken, amount, secretKey } = req.body;

  if (!fromToken || !toToken || !amount || !secretKey) {
    return res.status(400).json({ error: 'Campos obrigatórios: fromToken, toToken, amount, secretKey' });
  }

  try {
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    const secretKeyBuffer = Buffer.from(secretKey, 'base64');
    const payer = solanaWeb3.Keypair.fromSecretKey(secretKeyBuffer);

    // Rota de swap via Jupiter API (apenas devnet/mainnet)
    const quote = await axios.get(`https://quote-api.jup.ag/v6/quote`, {
      params: {
        inputMint: fromToken,
        outputMint: toToken,
        amount: amount, // em lamports (1 SOL = 10^9)
        slippageBps: 50, // 0.5% de slippage
      }
    });

    const bestRoute = quote.data;
    if (!bestRoute || !bestRoute.routes || bestRoute.routes.length === 0) {
      return res.status(400).json({ error: 'Não foi possível encontrar rota para esse par.' });
    }

    // OBS: Para executar swap de verdade, você precisará:
    // 1. Buscar transação da Jupiter (em base64)
    // 2. Assinar e enviar com Keypair
    // 3. Confirmar a transação

    res.json({
      message: '🧪 Simulação de swap bem-sucedida.',
      route: bestRoute.routes[0],
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao realizar swap.', details: err.message });
  }
});


app.get('/monitor-price', async (req, res) => {
  const { tokenMint } = req.query;

  if (!tokenMint) {
    return res.status(400).json({ error: 'Você precisa fornecer o mint address do token (tokenMint).' });
  }

  try {
    const response = await axios.get(`https://lite-api.jup.ag/price/v2?ids=${tokenMint}`);
    const price = response.data.data[tokenMint]?.price;

    if (!price) {
      return res.status(404).json({ error: 'Token não encontrado ou sem preço disponível.' });
    }

    res.json({
      tokenMint,
      price,
      time: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar preço.', details: err.message });
  }
});


function createBot(userId, tokenMint) {
  if (!bots[userId]) {
    bots[userId] = { started: false, interval: null, token: tokenMint };
  }

  if (bots[userId].started) {
    return false; // já iniciado
  }

  bots[userId].started = true;
  bots[userId].interval = setInterval(async () => {
    try {
      const res = await axios.get(`https://lite-api.jup.ag/price/v2?ids=${tokenMint}`);
      const price = res.data.data[tokenMint]?.price;
      if (price) {
        console.log(`[${userId}] Preço do token ${tokenMint}: $${price}`);
        // ➕ Lógica de swap aqui, por usuário
      }
    } catch (err) {
      console.error(`[${userId}] Erro ao buscar preço:`, err.message);
    }
  }, 10000);

  console.log(`[${userId}] Bot iniciado`);
  return true;
}

function stopBot(userId) {
  const bot = bots[userId];
  if (bot && bot.started) {
    clearInterval(bot.interval);
    bot.started = false;
    console.log(`[${userId}] Bot parado`);
    return true;
  }
  return false;
}

// ========= Endpoints =========

// Iniciar o bot de um usuário
app.post('/start-trading', (req, res) => {
  const { userId, tokenMint } = req.body;
  if (!userId || !tokenMint) {
    return res.status(400).send("Faltando userId ou tokenMint");
  }

  const started = createBot(userId, tokenMint);
  if (started) {
    res.send(`Bot do usuário ${userId} iniciado!`);
  } else {
    res.send(`Bot de ${userId} já está rodando.`);
  }
});

// Parar o bot de um usuário
app.post('/stop-trading', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).send("Faltando userId");
  }

  const stopped = stopBot(userId);
  if (stopped) {
    res.send(`Bot de ${userId} parado.`);
  } else {
    res.send(`Bot de ${userId} não estava rodando.`);
  }
});

// Ver status do bot do usuário
app.get('/status/:userId', (req, res) => {
  const { userId } = req.params;
  const bot = bots[userId];
  res.send(bot && bot.started ? 'rodando' : 'parado');
});

// Inicializa o servidor
app.listen(port, () => {
  console.log(`🚀 Bot ativo em http://localhost:${port}`);
});

