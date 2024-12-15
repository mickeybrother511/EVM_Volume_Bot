require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const bots = []; // Store active trading bots
// const botStates = {}; // Store bot states
let isRunning = false;

const CHAIN_CONFIG = {
  avax: {
    id: 1,
    name: "Avax C-chain",
    rpcUrl: process.env.AVAX_RPC_URL,
    maxGasPrice: 50, // gwei
    contracts: {
      router: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4",
      wAVAX: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      targetToken: process.env.AVAX_TARGET_TOKEN,
    },
    tradingParams: {
      minAmountAVAX: 0.01,
      maxAmountAVAX: 0.03,
      minInterval: 1 * 60 * 1000,
      maxInterval: 2 * 60 * 1000,
      gasMultiplier: 1.1,
      fundAmount: 0.4, // Amount to transfer to each temporary wallet
    },
  },
};

// Global Configuration
const GLOBAL_CONFIG = {
  RANDOM_VARIANCE: 0.01,
  MIN_AVAX_BALANCE: 0.001,
  ACTIVE_WALLET_PERCENTAGE: 0.7,
  RETRY_DELAY: 60000,
  CHECK_INTERVAL: 30000,
  WALLET_FUND_THRESHOLD: 0.05,
  IS_RUNNING: false,
};

class MultiChainTradingBot {
  constructor(chainKey, mainWalletPrivateKey, tempWalletCount) {
    this.chainConfig = CHAIN_CONFIG[chainKey];
    if (!this.chainConfig) {
      throw new Error(`Unsupported chain: ${chainKey}`);
    }

    this.provider = new ethers.providers.JsonRpcProvider(
      this.chainConfig.rpcUrl
    );
    this.mainWallet = new ethers.Wallet(mainWalletPrivateKey, this.provider);
    this.tempWalletCount = tempWalletCount;

    this.traderAvaxRouter = new ethers.Contract(
      this.chainConfig.contracts.router,
      require("./abis/router_avax.json"),
      this.provider
    );

    this.targetTokenContract = new ethers.Contract(
      this.chainConfig.contracts.targetToken,
      require("./abis/quad_avax.json"),
      this.provider
    );

    this.tempWallets = [];
    this.activeWallets = new Set();
    this.walletFile = `temp_wallets_${chainKey}.json`;
    this.running = false;
  }

  async initialize() {
    await this.checkMainWalletBalance();
    await this.initializeTempWallets();
    console.log(`[${this.chainConfig.name}] Bot initialized successfully`);
  }

  async checkMainWalletBalance() {
    const balance = await this.provider.getBalance(this.mainWallet.address);
    const balanceAVAX = Number(ethers.utils.formatEther(balance));
    console.log(
      `[${this.chainConfig.name}] Main wallet balance: ${balanceAVAX} AVAX`
    );
    if (balanceAVAX < GLOBAL_CONFIG.MIN_AVAX_BALANCE) {
      throw new Error(
        `Insufficient balance in main wallet: ${balanceAVAX} AVAX`
      );
    }
  }

  async initializeTempWallets() {
    try {
      if (fs.existsSync(this.walletFile)) {
        const walletData = fs.readFileSync(this.walletFile, "utf8");
        this.tempWallets = JSON.parse(walletData);
        console.log(
          `Loaded ${this.tempWallets.length} temporary wallets for ${this.chainConfig.name}`
        );
      } else {
        for (let i = 0; i < this.tempWalletCount; i++) {
          const privateKey = crypto.randomBytes(32).toString("hex");
          const wallet = new ethers.Wallet(privateKey, this.provider);
          this.tempWallets.push({
            address: wallet.address,
            privateKey: privateKey,
            lastTradeTime: 0,
          });
        }
        fs.writeFileSync(
          this.walletFile,
          JSON.stringify(this.tempWallets, null, 2)
        );
        console.log(
          `Created ${this.tempWalletCount} new temporary wallets for ${this.chainConfig.name}`
        );
      }
      this.updateActiveWallets();
    } catch (error) {
      console.error("Error initializing temporary wallets:", error);
      throw error;
    }
  }

  updateActiveWallets() {
    const activeCount = Math.floor(
      this.tempWallets.length * GLOBAL_CONFIG.ACTIVE_WALLET_PERCENTAGE
    );
    const shuffled = [...this.tempWallets].sort(() => 0.5 - Math.random());
    this.activeWallets = new Set(
      shuffled.slice(0, activeCount).map((w) => w.address)
    );
  }

  async fundWallet(walletAddress) {
    try {
      const balance = await this.provider.getBalance(walletAddress);
      const balanceAVAX = Number(ethers.utils.formatEther(balance));

      if (balanceAVAX < GLOBAL_CONFIG.WALLET_FUND_THRESHOLD) {
        const fundAmount = ethers.utils.parseEther(
          this.chainConfig.tradingParams.fundAmount.toFixed(18)
        );

        const tx = await this.mainWallet.sendTransaction({
          to: walletAddress,
          value: fundAmount,
          gasLimit: 21000,
          gasPrice: await this.provider.getGasPrice(),
        });

        await tx.wait();
        console.log(
          `Funded wallet ${walletAddress} with ${this.chainConfig.tradingParams.fundAmount} AVAX`
        );
      }
    } catch (error) {
      console.error(`Error funding wallet ${walletAddress}:`, error);
    }
  }

  async calculateSlippage(amountIn, path) {
    try {
      const amounts = await this.traderAvaxRouter.getAmountsOut(amountIn, path);
      const expectedOutput = amounts[amounts.length - 1];
      return ethers.utils.formatEther(expectedOutput);
    } catch (error) {
      console.error("Error calculating slippage:", error);
      return null;
    }
  }

  generateRandomAmount() {
    const { minAmountAVAX, maxAmountAVAX } = this.chainConfig.tradingParams;
    const baseAmount =
      minAmountAVAX + Math.random() * (maxAmountAVAX - minAmountAVAX);
    const variance =
      baseAmount * GLOBAL_CONFIG.RANDOM_VARIANCE * (Math.random() * 2 - 1);
    return baseAmount + variance;
  }

  generateRandomDelay() {
    const { minInterval, maxInterval } = this.chainConfig.tradingParams;
    return minInterval + Math.random() * (maxInterval - minInterval);
  }

  async isGasPriceAcceptable() {
    const chainGas = await this.provider.getGasPrice();
    const chainGasGwei = Number(ethers.utils.formatUnits(chainGas, "gwei"));
    return chainGasGwei < this.chainConfig.maxGasPrice;
  }

  async executeTrade(walletInfo) {
    const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);
    try {
      await this.fundWallet(wallet.address);
      const AVAXBalance = await this.provider.getBalance(wallet.address);
      const tokenBalance = await this.targetTokenContract.balanceOf(
        wallet.address
      );

      const AVAXBalanceNum = Number(ethers.utils.formatEther(AVAXBalance));
      const tokenBalanceNum = Number(ethers.utils.formatEther(tokenBalance));

      const tradeAmount = this.generateRandomAmount();

      if (AVAXBalanceNum < tradeAmount + GLOBAL_CONFIG.MIN_AVAX_BALANCE) {
        console.log(`Insufficient AVAX balance in wallet ${wallet.address}`);
        return;
      }

      const canSell = tokenBalanceNum > 0;
      const isBuy = !canSell || Math.random() > 0.5;

      const gasPrice = await this.provider.getGasPrice();
      const adjustedGasPrice = gasPrice
        .mul(Math.floor(this.chainConfig.tradingParams.gasMultiplier * 100))
        .div(100);

      if (isBuy) {
        await this.buyTokensWithAVAX(wallet, tradeAmount, adjustedGasPrice);
      } else {
        await this.sellTokensForAVAX(wallet, tokenBalanceNum, adjustedGasPrice);
        await this.returnFundsToMain(walletInfo);
      }

      walletInfo.lastTradeTime = Date.now();
      console.log(
        `[${this.chainConfig.name}] Trade executed for wallet ${
          wallet.address
        }: ${isBuy ? "BUY" : "SELL"} ${tradeAmount} AVAX`
      );
    } catch (error) {
      console.error(
        `[${this.chainConfig.name}] Trade failed for wallet ${wallet.address}:`,
        error
      );
    }
  }

  async buyTokensWithAVAX(wallet, amountAVAX, gasPrice) {
    const path = [
      this.chainConfig.contracts.wAVAX,
      this.chainConfig.contracts.targetToken,
    ];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const amountInWei = ethers.utils.parseEther(amountAVAX.toFixed(18));

    const expectedOutput = await this.calculateSlippage(amountInWei, path);
    const minOut = expectedOutput
      ? ethers.utils.parseEther((Number(expectedOutput) * 0.95).toFixed(18))
      : 0;

    const tx = await this.traderAvaxRouter
      .connect(wallet)
      .swapExactAVAXForTokens(minOut, path, wallet.address, deadline, {
        value: amountInWei,
        gasLimit: 300000,
        gasPrice,
      });

    await tx.wait();
  }

  async sellTokensForAVAX(wallet, availableAmount, gasPrice) {
    const sellPercentage = 0.3 + Math.random() * 0.4; // Randomly sell between 30% to 70%
    const amountToSell = availableAmount * sellPercentage;

    const amountIn = ethers.utils.parseEther(amountToSell.toFixed(18));
    await this.targetTokenContract
      .connect(wallet)
      .approve(this.chainConfig.contracts.router, amountIn);

    const path = [
      this.chainConfig.contracts.targetToken,
      this.chainConfig.contracts.wAVAX,
    ];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

    const expectedOutput = await this.calculateSlippage(amountIn, path);
    const minOut = expectedOutput
      ? ethers.utils.parseEther((Number(expectedOutput) * 0.95).toFixed(18))
      : 0;

    const tx = await this.traderAvaxRouter
      .connect(wallet)
      .swapExactTokensForAVAX(
        amountIn,
        minOut,
        path,
        wallet.address,
        deadline,
        {
          gasLimit: 300000,
          gasPrice,
        }
      );

    await tx.wait();
  }

  async returnFundsToMain(walletInfo) {
    const wallet = new ethers.Wallet(walletInfo.privateKey, this.provider);
    try {
      const balance = await this.provider.getBalance(wallet.address);
      const gasPrice = await this.provider.getGasPrice();
      const gasLimit = 21000;
      const amountToSend = balance.sub(gasPrice.mul(gasLimit));

      if (amountToSend.gt(0)) {
        const tx = await wallet.sendTransaction({
          to: this.mainWallet.address,
          value: amountToSend,
          gasLimit,
          gasPrice,
        });
        await tx.wait();
        console.log(
          `Returned ${ethers.utils.formatEther(
            amountToSend
          )} AVAX to main wallet from ${wallet.address}`
        );
      }
    } catch (error) {
      console.error(
        `Error returning funds from wallet ${wallet.address}:`,
        error
      );
    }
  }

  async startTrading() {
    if (this.running) {
      throw new Error(
        "Now, the Bot is trading. If you want new trading, please stop it first."
      );
    }

    isRunning = true; // Set bot state to 'running'

    console.log(
      `Starting trading bot on ${this.chainConfig.name} with main wallet ${this.mainWallet.address}...`
    );
    this.running = true;

    while (this.running) {
      try {
        if (Math.random() < 0.1) {
          this.updateActiveWallets();
          console.log(`[${this.chainConfig.name}] Updated active wallets pool`);
        }

        const gasOk = await this.isGasPriceAcceptable();
        if (!gasOk) {
          console.log(
            `[${this.chainConfig.name}] Gas price too high, waiting...`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, GLOBAL_CONFIG.RETRY_DELAY)
          );
          continue;
        }

        const now = Date.now();
        const eligibleWallets = this.tempWallets.filter(
          (wallet) =>
            this.activeWallets.has(wallet.address) &&
            now - wallet.lastTradeTime >= this.generateRandomDelay()
        );

        for (const wallet of eligibleWallets) {
          await this.executeTrade(wallet);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.floor(1000 + Math.random() * 2000))
          );
        }

        fs.writeFileSync(
          this.walletFile,
          JSON.stringify(this.tempWallets, null, 2)
        );
        await new Promise((resolve) =>
          setTimeout(resolve, GLOBAL_CONFIG.CHECK_INTERVAL)
        );
      } catch (error) {
        console.error(
          `[${this.chainConfig.name}] Error in trading loop:`,
          error
        );
        await new Promise((resolve) =>
          setTimeout(resolve, GLOBAL_CONFIG.RETRY_DELAY)
        );
      }
    }

    console.log(`[${this.chainConfig.name}] Trading stopped.`);
  }

  stopTrading() {
    this.running = false; // Stop the trading loop
    isRunning = false; // Update bot state to 'not running'
  }
}

// API Endpoints
app.post("/api/start", async (req, res) => {
  const {
    walletCounts,
    AvaxFundAmount,
    maxGas,
    tradingMintAmount,
    tradingMaxAmount,
    tradingMinInterval,
    tradingMaxInterval,
  } = req.body;

  try {
    const MAIN_WALLET_PRIVATE_KEY = process.env.MAIN_WALLET_PRIVATE_KEY;

    if (isRunning) {
      return res.status(400).json({
        error:
          "Now, the Bot is trading. If you want new trading, please stop it first.",
      });
    }

    const bot = new MultiChainTradingBot(
      "avax",
      MAIN_WALLET_PRIVATE_KEY,
      parseInt(walletCounts) || 5
    );

    bot.chainConfig.tradingParams.fundAmount =
      parseFloat(AvaxFundAmount) || bot.chainConfig.tradingParams.fundAmount;
    bot.chainConfig.maxGasPrice =
      parseFloat(maxGas) || bot.chainConfig.maxGasPrice;
    bot.chainConfig.tradingParams.minAmountAVAX =
      parseFloat(tradingMintAmount) ||
      bot.chainConfig.tradingParams.minAmountAVAX;
    bot.chainConfig.tradingParams.maxAmountAVAX =
      parseFloat(tradingMaxAmount) ||
      bot.chainConfig.tradingParams.maxAmountAVAX;
    bot.chainConfig.tradingParams.minInterval =
      parseInt(tradingMinInterval) * 1000 ||
      bot.chainConfig.tradingParams.minInterval;
    bot.chainConfig.tradingParams.maxInterval =
      parseInt(tradingMaxInterval) * 1000 ||
      bot.chainConfig.tradingParams.maxInterval;

    await bot.initialize(); // Initialize the bot
    bots.push(bot); // Keep track of this instance
    bot.startTrading(); // Start trading

    res.json({ message: "Trading bot started successfully." });
  } catch (error) {
    console.error("Error while starting the trading bot:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to start trading bot." });
  }
});

// Stop trading bot
app.post("/api/stop", (req, res) => {
  try {
    bots.forEach((bot) => {
      bot.stopTrading(); // Stop each bot instance
    });
    res.json({ message: "All trading bots stopped successfully." });
  } catch (error) {
    console.error("Error while stopping trading bots:", error);
    res.status(500).json({ error: "Failed to stop trading bots." });
  }
});

app.get("/api/is_running", (req, res) => {
  if (isRunning) res.json({ message: true });
  res.json({ message: false });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
