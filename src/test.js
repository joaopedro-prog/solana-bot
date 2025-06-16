const axios = require('axios');
const TokenAPI = require('./api');

class TokenPriceUpdater {
  constructor() {
    this.prices = new Map(); // mint -> { price, lastUpdate }
    this.subscribers = new Map(); // mint -> callback[]
  }

  async updatePrice(mint) {
    try {
      const response = await axios.get(`https://price.jup.ag/v4/price?ids=${mint}`);
      const priceData = response.data.data[mint];
      
      if (priceData) {
        const now = Date.now();
        const price = priceData.price;
        
        this.prices.set(mint, {
          price: price,
          lastUpdate: now
        });

        // Notifica todos os subscribers deste mint
        const subscribers = this.subscribers.get(mint) || [];
        subscribers.forEach(callback => callback({
          mint: mint,
          price: price
        }));
      }
    } catch (error) {
      console.error('❌ Erro ao obter preço do Jupiter:', error.message);
    }
  }

  subscribe(mint, callback) {
    if (!this.subscribers.has(mint)) {
      this.subscribers.set(mint, []);
    }
    this.subscribers.get(mint).push(callback);
  }

  unsubscribe(mint, callback) {
    if (this.subscribers.has(mint)) {
      const callbacks = this.subscribers.get(mint);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  getPrice(mint) {
    return this.prices.get(mint)?.price;
  }
}

class TradingBot {
  constructor(config = {}) {
    // Configurações do bot
    this.config = {
      initialBalance: config.initialBalance || 1, // em SOL
      tradeAmount: config.tradeAmount || 0.1, // valor por trade
      profitTarget: config.profitTarget || 0.3, // 30% de lucro alvo
      stopLoss: config.stopLoss || 0.1, // 10% de stop loss
      maxActiveTrades: config.maxActiveTrades || 3, // máximo de trades simultâneos
      minLiquidity: config.minLiquidity || 10, // liquidez mínima em SOL
      maxLiquidity: config.maxLiquidity || 100 // liquidez máxima em SOL
    };

    // Estado do bot
    this.balance = this.config.initialBalance;
    this.activeTrades = new Map(); // mint -> trade
    this.totalProfit = 0;
    this.totalTrades = 0;
    this.successfulTrades = 0;
    this.failedTrades = 0;
    this.priceUpdater = new TokenPriceUpdater();

    console.log('🤖 Bot Iniciado com as seguintes configurações:');
    console.log(`💰 Saldo inicial: ${this.balance} SOL`);
    console.log(`💵 Valor por trade: ${this.config.tradeAmount} SOL`);
    console.log(`🎯 Objetivo de lucro: ${this.config.profitTarget * 100}%`);
    console.log(`🛑 Stop Loss: ${this.config.stopLoss * 100}%`);
    console.log(`📊 Máximo de trades simultâneos: ${this.config.maxActiveTrades}`);
    console.log(`💧 Faixa de liquidez: ${this.config.minLiquidity}-${this.config.maxLiquidity} SOL`);
    console.log('⏳ Aguardando oportunidades...\n');
  }

  canStartNewTrade() {
    return this.balance >= this.config.tradeAmount && 
           this.activeTrades.size < this.config.maxActiveTrades;
  }

  startTrade(token) {
    if (!this.canStartNewTrade()) {
      console.log('❌ Não é possível iniciar novo trade:');
      if (this.balance < this.config.tradeAmount) {
        console.log('   - Saldo insuficiente');
      }
      if (this.activeTrades.size >= this.config.maxActiveTrades) {
        console.log('   - Número máximo de trades atingido');
      }
      return;
    }

    this.balance -= this.config.tradeAmount;
    this.totalTrades++;
    
    const trade = {
      token: token,
      entryPrice: token.vSolInBondingCurve,
      entryTime: new Date(),
      amount: this.config.tradeAmount,
      lastUpdate: Date.now()
    };

    this.activeTrades.set(token.mint, trade);

    // Inscreve para receber atualizações de preço do Jupiter
    this.priceUpdater.subscribe(token.mint, this.handlePriceUpdate.bind(this));
    
    console.log('\n🆕 Novo Trade Iniciado:');
    console.log('Token:', token.symbol);
    console.log('Nome:', token.name);
    console.log('Preço de Entrada:', token.vSolInBondingCurve, 'SOL');
    console.log('Valor Investido:', this.config.tradeAmount, 'SOL');
    console.log('Trades Ativos:', this.activeTrades.size);
    console.log('------------------------');

    // Inicia o loop de atualização de preço
    this.startPriceUpdates(token.mint);
  }

  startPriceUpdates(mint) {
    // Atualiza o preço a cada 2 segundos
    const interval = setInterval(async () => {
      if (this.activeTrades.has(mint)) {
        await this.priceUpdater.updatePrice(mint);
      } else {
        clearInterval(interval);
      }
    }, 2000);
  }

  handlePriceUpdate(priceData) {
    const trade = this.activeTrades.get(priceData.mint);
    if (!trade) return;

    const currentPrice = priceData.price;
    const priceChange = (currentPrice - trade.entryPrice) / trade.entryPrice;
    const profitAmount = trade.amount * priceChange;
    const now = Date.now();

    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n⏰ ${timestamp} - Trade Ativo: ${trade.token.symbol}`);
    console.log('------------------------');
    console.log('Preço de Entrada:', trade.entryPrice.toFixed(4), 'SOL');
    console.log('Preço Atual:', currentPrice.toFixed(4), 'SOL');
    console.log('Variação:', (priceChange * 100).toFixed(2) + '%');
    console.log('Lucro/Prejuízo:', profitAmount.toFixed(4), 'SOL');
    console.log('------------------------');
    console.log('🎯 Objetivo:', (this.config.profitTarget * 100).toFixed(1) + '%');
    console.log('🛑 Stop Loss:', (this.config.stopLoss * 100).toFixed(1) + '%');
    console.log('------------------------');

    // Verifica se atingiu objetivo de lucro ou stop loss
    if (priceChange >= this.config.profitTarget) {
      this.closeTrade(priceData.mint, true);
    } else if (priceChange <= -this.config.stopLoss) {
      this.closeTrade(priceData.mint, false);
    }
  }

  closeTrade(mint, isSuccess) {
    const trade = this.activeTrades.get(mint);
    if (!trade) return;

    const currentPrice = this.priceUpdater.getPrice(mint);
    const priceChange = (currentPrice - trade.entryPrice) / trade.entryPrice;
    const profit = trade.amount * priceChange;
    
    this.balance += (trade.amount + profit);
    this.totalProfit += profit;

    // Cancela a inscrição de atualizações
    this.priceUpdater.unsubscribe(mint, this.handlePriceUpdate.bind(this));
    this.activeTrades.delete(mint);

    if (isSuccess) {
      this.successfulTrades++;
      console.log('\n✅ Trade Finalizado com Lucro:');
    } else {
      this.failedTrades++;
      console.log('\n❌ Trade Finalizado com Prejuízo:');
    }

    console.log('Token:', trade.token.symbol);
    console.log('Preço de Entrada:', trade.entryPrice.toFixed(4), 'SOL');
    console.log('Preço de Saída:', currentPrice.toFixed(4), 'SOL');
    console.log('Variação:', (priceChange * 100).toFixed(2) + '%');
    console.log('Resultado:', profit.toFixed(4), 'SOL');
    console.log('Saldo Atual:', this.balance.toFixed(4), 'SOL');
    console.log('Lucro Total:', this.totalProfit.toFixed(4), 'SOL');
    console.log('Taxa de Sucesso:', ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) + '%');
    console.log('Trades Ativos:', this.activeTrades.size);
    console.log('------------------------');
  }

  getStatus() {
    return {
      balance: this.balance,
      activeTrades: this.activeTrades.size,
      totalTrades: this.totalTrades,
      successfulTrades: this.successfulTrades,
      failedTrades: this.failedTrades,
      totalProfit: this.totalProfit,
      successRate: (this.successfulTrades / this.totalTrades) * 100
    };
  }
}

// Exemplo de uso
const bot = new TradingBot({
  initialBalance: 1,
  tradeAmount: 0.1,
  profitTarget: 0.3,
  stopLoss: 0.1,
  maxActiveTrades: 3,
  minLiquidity: 10,
  maxLiquidity: 100
});

// Exemplo de como simular um novo token
const tokenAPI = new TokenAPI();
tokenAPI.simulateNewToken({
  mint: 'ABC123',
  symbol: 'ABC',
  name: 'ABC Token',
  vSolInBondingCurve: 50
});
