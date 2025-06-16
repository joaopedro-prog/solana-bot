const axios = require('axios');
const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const WebSocket = require('ws');

class TokenDiscovery {
  constructor() {
    this.ws = null;
    this.tokenSubscribers = new Map();
    this.setupWebSocket();
  }

  setupWebSocket() {
    try {
      if (this.ws) {
        this.ws.terminate();
      }

      this.ws = new WebSocket('wss://pumpportal.fun/api/data');

      this.ws.on('open', () => {
        console.log('✅ WebSocket conectado');
        let payload = {
          method: "subscribeNewToken"
        };
        this.ws.send(JSON.stringify(payload));
      });

      this.ws.on('message', (data) => {
        try {
          const token = JSON.parse(data);
          this.tokenSubscribers.forEach((callback) => {
            callback(token);
          });
        } catch (error) {
          console.error('Erro ao processar mensagem:', error.message);
        }
      });

      this.ws.on('error', (err) => {
        console.error('Erro na conexão WebSocket:', err.message);
        this.reconnect();
      });

      this.ws.on('close', () => {
        console.log('Conexão WebSocket fechada');
        this.reconnect();
      });
    } catch (error) {
      console.error('Erro ao configurar WebSocket:', error.message);
      this.reconnect();
    }
  }

  reconnect() {
    console.log('🔄 Tentando reconectar em 5 segundos...');
    setTimeout(() => {
      console.log('🔄 Reconectando...');
      this.setupWebSocket();
    }, 5000);
  }

  subscribe(callback) {
    const id = Date.now().toString();
    this.tokenSubscribers.set(id, callback);
    return id;
  }

  unsubscribe(id) {
    this.tokenSubscribers.delete(id);
  }

  async findNewTokens(duration = 5000) {
    return new Promise((resolve) => {
      const tokens = [];
      const subscriptionId = this.subscribe((token) => {
        tokens.push(token);
      });

      setTimeout(() => {
        this.unsubscribe(subscriptionId);
        resolve(tokens);
      }, duration);
    });
  }
}

class TradingBot {
  constructor() {
    this.bots = new Map();
  }

  // Filtrar tokens baseado em critérios
  async filterTokens(tokens, filters = {}) {
    return tokens.filter(token => {
      // Filtro de liquidez mínima
      if (filters.minLiquidity && token.vSolInBondingCurve < filters.minLiquidity) {
        return false;
      }

      // Filtro de preço máximo
      if (filters.maxPrice && token.vSolInBondingCurve > filters.maxPrice) {
        return false;
      }

      // Filtro de compra inicial mínima
      if (filters.minInitialBuy && token.initialBuy < filters.minInitialBuy) {
        return false;
      }

      // Filtro de market cap mínima
      if (filters.minMarketCap && token.marketCapSol < filters.minMarketCap) {
        return false;
      }

      // Filtro de símbolo (case insensitive)
      if (filters.symbolPattern && !token.symbol.toLowerCase().includes(filters.symbolPattern.toLowerCase())) {
        return false;
      }

      // Filtro de nome (case insensitive)
      if (filters.namePattern && !token.name.toLowerCase().includes(filters.namePattern.toLowerCase())) {
        return false;
      }

      // Filtro de mercados conhecidos
      if (filters.minKnownMarkets && (!token.known_markets || token.known_markets.length < filters.minKnownMarkets)) {
        return false;
      }

      return true;
    });
  }

  // Obter tokens descobertos
  async getDiscoveredTokens(wallet) {
    try {
      const bot = this.bots.get(wallet);
      const tokens = await this.tokenDiscovery.findNewTokens();
      
      const processedTokens = tokens.map(token => ({
        ...token,
        currentPrice: token.vSolInBondingCurve,
        lastUpdate: new Date().toISOString()
      }));

      // Aplica filtros se houver um bot configurado
      const filteredTokens = bot ? 
        await this.filterTokens(processedTokens, bot.config.filters) : 
        processedTokens;

      return {
        tokens: filteredTokens,
        total: filteredTokens.length,
        filters: bot?.config.filters || {},
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[${wallet}] Erro ao obter tokens descobertos:`, error.message);
      return { tokens: [] };
    }
  }

  // Configuração padrão do bot
  getDefaultConfig() {
    return {
      buy: {
        amount: 0.01, // em SOL
        priorityFee: 0.001,
        slippage: 30, // 30%
      },
      sell: {
        takeProfit: 25, // 25%
        stopLoss: 15, // 15%
        slippage: 30, // 30%
        timeout: 60, // segundos
        priorityFee: 0.001,
      },
      filters: {
        minLiquidity: 1000, // em SOL
        minVolume24h: 500, // em SOL
        maxTokens: 5, // máximo de tokens simultâneos
      }
    };
  }

  // Estrutura para um trade ativo
  createTradeStructure(tokenMint, entryPrice, config) {
    return {
      tokenMint,
      entryPrice,
      entryTime: Date.now(),
      status: 'active',
      config: {
        takeProfit: entryPrice * (1 + config.sell.takeProfit / 100),
        stopLoss: entryPrice * (1 - config.sell.stopLoss / 100),
        timeout: Date.now() + (config.sell.timeout * 1000)
      }
    };
  }

  // Iniciar bot com configurações personalizadas
  createBot(wallet, config = {}) {
    if (!this.bots.has(wallet)) {
      this.bots.set(wallet, {
        config: { ...this.getDefaultConfig(), ...config },
        activeTrades: new Map(),
        interval: null,
        started: false
      });
    }

    const bot = this.bots.get(wallet);
    if (bot.started) {
      return false;
    }

    bot.started = true;
    bot.interval = setInterval(async () => {
      await this.monitorAndTrade(wallet);
    }, 10000); // Verifica a cada 10 segundos

    console.log(`[${wallet}] Bot iniciado com configurações:`, bot.config);
    return true;
  }

  // Monitorar e executar trades
  async monitorAndTrade(wallet) {
    const bot = this.bots.get(wallet);
    if (!bot || !bot.started) return;

    try {
      // 1. Verificar trades ativos
      await this.checkActiveTrades(wallet);

      // 2. Buscar novos tokens
      const newTokens = await this.tokenDiscovery.findNewTokens();

      // 3. Filtrar tokens
      const filteredTokens = await this.filterTokens(newTokens, bot.config.filters);

      // 4. Executar trades para tokens filtrados
      for (const token of filteredTokens) {
        if (bot.activeTrades.size < bot.config.filters.maxTokens) {
          await this.executeBuy(wallet, token);
        }
      }
    } catch (err) {
      console.error(`[${wallet}] Erro no monitoramento:`, err.message);
    }
  }

  // Verificar trades ativos
  async checkActiveTrades(wallet) {
    const bot = this.bots.get(wallet);
    const currentTime = Date.now();

    for (const [tokenMint, trade] of bot.activeTrades) {
      try {
        const currentPrice = await this.getTokenPrice(tokenMint);

        // Verificar take profit
        if (currentPrice.price >= trade.config.takeProfit) {
          await this.executeSell(wallet, tokenMint, 'take_profit');
          continue;
        }

        // Verificar stop loss
        if (currentPrice.price <= trade.config.stopLoss) {
          await this.executeSell(wallet, tokenMint, 'stop_loss');
          continue;
        }

        // Verificar timeout
        if (currentTime >= trade.config.timeout) {
          await this.executeSell(wallet, tokenMint, 'timeout');
          continue;
        }
      } catch (err) {
        console.error(`[${wallet}] Erro ao verificar trade ${tokenMint}:`, err.message);
      }
    }
  }

  // Executar compra
  async executeBuy(wallet, token) {
    const bot = this.bots.get(wallet);
    try {
      const currentPrice = await this.getTokenPrice(token.mint);
      
      // Aqui você implementaria a lógica de compra usando Jupiter ou outra DEX
      // Por enquanto, apenas simulamos a compra
      console.log(`[${wallet}] Comprando ${token.mint} a $${currentPrice.price}`);

      bot.activeTrades.set(token.mint, this.createTradeStructure(
        token.mint,
        currentPrice.price,
        bot.config
      ));
    } catch (err) {
      console.error(`[${wallet}] Erro ao executar compra:`, err.message);
    }
  }

  // Executar venda
  async executeSell(wallet, tokenMint, reason) {
    const bot = this.bots.get(wallet);
    try {
      const trade = bot.activeTrades.get(tokenMint);
      if (!trade) return;

      // Aqui você implementaria a lógica de venda usando Jupiter ou outra DEX
      console.log(`[${wallet}] Vendendo ${tokenMint} por motivo: ${reason}`);

      bot.activeTrades.delete(tokenMint);
    } catch (err) {
      console.error(`[${wallet}] Erro ao executar venda:`, err.message);
    }
  }

  // Obter preço do token
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

  // Parar bot
  stopBot(wallet) {
    const bot = this.bots.get(wallet);
    if (bot && bot.started) {
      clearInterval(bot.interval);
      bot.started = false;
      console.log(`[${wallet}] Bot parado`);
      return true;
    }
    return false;
  }

  // Obter status do bot
  getBotStatus(wallet) {
    const bot = this.bots.get(wallet);
    if (!bot) return 'não_iniciado';
    if (!bot.started) return 'parado';
    
    return {
      status: 'rodando',
      activeTrades: bot.activeTrades.size,
      config: bot.config
    };
  }

  startSimulatingTrades() {
    return tradeSimulator.startSimulation();
  }

  stopSimulatingTrades() {
    return tradeSimulator.stopSimulation();
  }

  getSimulatedTrades() {
    return tradeSimulator.getSimulatedTrades();
  }
}

test = new TradingBot();

test.startSimulatingTrades();
console.log(test.getSimulatedTrades());

module.exports = new TradingBot(); 