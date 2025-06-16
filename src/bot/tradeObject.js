

class TradeObject {
    constructor(tokenName, tradeAmount, initialPrice, botConfig) {
        this.tokenName = tokenName;
        this.tradeAmount = tradeAmount;
        this.initialPrice = initialPrice;
        this.currentPrice = initialPrice;
        this.initialTimestamp = new Date().toISOString();
        this.status = "pending";
        this.profit = 0;
        this.profitPercentage = 0;
        this.sellDecision = false;
        this.botConfig = botConfig;
        this.timeout = botConfig.sell.timeout;
    }

    updatePrice(price) {
        this.currentPrice = price;
        this.profit = (price - this.initialPrice) * this.tradeAmount;
        this.profitPercentage = (price - this.initialPrice) / this.initialPrice * 100;
    }

    setStatus(status) {
        this.status = status;
    }

    getSellDecision() {
        if (this.profitPercentage >= this.botConfig.sell.takeProfit) {
            this.sellDecision = true;
        } else if (this.profitPercentage <= this.botConfig.sell.stopLoss) {
            this.sellDecision = true;
        }
        if (this.status === "pending" && new Date().getTime() - this.initialTimestamp > this.timeout * 1000) {
            this.sellDecision = true;
        }
    }

    getProfit() {
        return this.profit;
    }
    
    getStatus() {
        return this.status;
    }

    getTokenName() {
        return this.tokenName;
    }
    
    
}