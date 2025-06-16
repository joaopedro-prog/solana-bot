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
  

