const tradingBot = require('./bot/bot');

// Inicia a simulação
console.log('🚀 Iniciando simulação...');
tradingBot.startSimulatingTrades();

// Mostra as trades a cada 3 segundos
const interval = setInterval(() => {
    console.clear(); // Limpa o console
    console.log('📊 Trades Simulados:');
    console.log('-------------------');
    
    const trades = tradingBot.getSimulatedTrades();
    trades.forEach(trade => {
        console.log(`
Token: ${trade.tokenName}
Valor: ${trade.tradeAmount} SOL
Preço Inicial: ${trade.initialPrice} SOL
Preço Atual: ${trade.currentPrice} SOL
Status: ${trade.status}
Lucro: ${trade.profit.toFixed(4)} SOL (${trade.profitPercentage.toFixed(2)}%)
Timestamp: ${trade.timestamp}
-------------------`);
    });
}, 3000);

// Para a simulação após 1 minuto
setTimeout(() => {
    clearInterval(interval);
    tradingBot.stopSimulatingTrades();
    console.log('\n⏹️ Simulação finalizada!');
    process.exit(0);
}, 60000); 