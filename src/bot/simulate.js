const tradingBot = require('./botObject');
const fs = require('fs');
const path = require('path');
const TradeObject = require('./tradeObject');

class TradeSimulator {
  constructor() {
    this.isSimulating = false;
    this.simulationInterval = null;
    this.updateInterval = null;
    this.simulatedTrades = new Map();
    this.tradesFile = path.join(__dirname, 'simulated_trades.json');
    this.loadTrades();
  }

  loadTrades() {
    try {
      if (fs.existsSync(this.tradesFile)) {
        const data = JSON.parse(fs.readFileSync(this.tradesFile, 'utf8'));
        this.simulatedTrades = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('Erro ao carregar trades:', error);
    }
  }

  saveTrades() {
    try {
      const data = Object.fromEntries(this.simulatedTrades);
      fs.writeFileSync(this.tradesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Erro ao salvar trades:', error);
    }
  }

  startSimulation() {
    if (this.isSimulating) return false;
    
    this.isSimulating = true;
    
    // Intervalo para gerar novas trades
    this.simulationInterval = setInterval(() => {
      this.generateSimulatedTrade();
    }, this.getRandomInterval());

    // Intervalo para atualizar trades existentes
    this.updateInterval = setInterval(() => {
      this.updateTrades();
    }, 2000); // Atualiza a cada 2 segundos

    return true;
  }

  stopSimulation() {
    if (!this.isSimulating) return false;
    
    clearInterval(this.simulationInterval);
    clearInterval(this.updateInterval);
    this.isSimulating = false;
    return true;
  }

  getRandomInterval() {
    return Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000; // Entre 5 e 15 segundos
  }

  generateSimulatedTrade() {
    const tokenNames = ['BONK', 'SAMO', 'RAY', 'SRM', 'ORCA', 'JUP', 'PYTH', 'JTO'];
    const randomToken = tokenNames[Math.floor(Math.random() * tokenNames.length)];
    
    const tradeAmount = (Math.random() * 0.5 + 0.1).toFixed(2); // Entre 0.1 e 0.6 SOL
    const initialPrice = (Math.random() * 0.1 + 0.01).toFixed(4); // Entre 0.01 e 0.11 SOL
    
    const botConfig = {
      sell: {
        takeProfit: 25, // 25%
        stopLoss: 15, // 15%
        timeout: 60 // 60 segundos
      }
    };

    const trade = new TradeObject(
      randomToken,
      parseFloat(tradeAmount),
      parseFloat(initialPrice),
      botConfig
    );

    const tradeId = Date.now().toString();
    this.simulatedTrades.set(tradeId, trade);
    this.saveTrades();
    return trade;
  }

  updateTrades() {
    let hasChanges = false;
    
    for (const [id, trade] of this.simulatedTrades) {
      if (trade.getStatus() === 'completed') {
        this.simulatedTrades.delete(id);
        hasChanges = true;
        continue;
      }

      // Atualiza o preço com uma variação aleatória
      const priceVariation = (Math.random() * 0.1 - 0.05); // Variação de -5% a +5%
      const newPrice = trade.currentPrice * (1 + priceVariation);
      trade.updatePrice(newPrice);

      // Verifica se deve vender
      trade.getSellDecision();
      if (trade.sellDecision) {
        trade.setStatus('completed');
      }
      
      hasChanges = true;
    }

    if (hasChanges) {
      this.saveTrades();
    }
  }

  getSimulatedTrades() {
    return Array.from(this.simulatedTrades.entries()).map(([id, trade]) => ({
      id,
      tokenName: trade.getTokenName(),
      tradeAmount: trade.tradeAmount,
      initialPrice: trade.initialPrice,
      currentPrice: trade.currentPrice,
      status: trade.getStatus(),
      profit: trade.getProfit(),
      profitPercentage: trade.profitPercentage,
      timestamp: trade.initialTimestamp
    }));
  }
}

module.exports = new TradeSimulator();
