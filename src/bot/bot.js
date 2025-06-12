const axios = require('axios');

class TradingBot {
  constructor() {
    this.bots = {}; // chave: wallet → valor: { interval, started, token }
  }

  createBot(wallet, tokenMint) {
    if (!this.bots[wallet]) {
      this.bots[wallet] = { started: false, interval: null, token: tokenMint };
    }

    if (this.bots[wallet].started) {
      return false;
    }

    this.bots[wallet].started = true;
    this.bots[wallet].interval = setInterval(async () => {
      try {
        const res = await axios.get(`https://lite-api.jup.ag/price/v2?ids=${tokenMint}`);
        const price = res.data.data[tokenMint]?.price;
        if (price) {
          console.log(`[${wallet}] Preço do token ${tokenMint}: $${price}`);
          // Lógica de swap aqui
        }
      } catch (err) {
        console.error(`[${wallet}] Erro ao buscar preço:`, err.message);
      }
    }, 10000);

    console.log(`[${wallet}] Bot iniciado`);
    return true;
  }

  stopBot(wallet) {
    const bot = this.bots[wallet];
    if (bot && bot.started) {
      clearInterval(bot.interval);
      bot.started = false;
      console.log(`[${wallet}] Bot parado`);
      return true;
    }
    return false;
  }

  getBotStatus(wallet) {
    const bot = this.bots[wallet];
    return bot && bot.started ? 'rodando' : 'parado';
  }

  async getTokenPrice(tokenMint) {
    try {
      const response = await axios.get(`https://lite-api.jup.ag/price/v2?ids=${tokenMint}`);
      const price = response.data.data[tokenMint]?.price;
      
      if (!price) {
        throw new Error('Token não encontrado ou sem preço disponível.');
      }

      return {
        tokenMint,
        price,
        time: new Date().toISOString()
      };
    } catch (err) {
      throw new Error(`Erro ao consultar preço: ${err.message}`);
    }
  }
}

module.exports = new TradingBot(); 