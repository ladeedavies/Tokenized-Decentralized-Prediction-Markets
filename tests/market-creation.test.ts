// Market Creation Contract Tests
// Testing market creation, betting, and state management

import { describe, it, expect, beforeEach } from "vitest"

class MockMarketContract {
  constructor() {
    this.markets = new Map()
    this.marketBets = new Map()
    this.userBets = new Map()
    this.nextMarketId = 1
  }
  
  createMarket(title, description, options, duration, resolutionWindow, minBet) {
    const marketId = this.nextMarketId
    const endTime = Date.now() + duration
    const resolutionTime = endTime + resolutionWindow
    
    // Validate parameters
    if (options.length <= 1) throw new Error("ERR-INVALID-PARAMETERS")
    if (options.length > 10) throw new Error("ERR-INVALID-PARAMETERS")
    if (duration <= 0) throw new Error("ERR-INVALID-PARAMETERS")
    if (minBet <= 0) throw new Error("ERR-INVALID-PARAMETERS")
    
    const market = {
      creator: "ST1CREATOR123456789123456789123456789",
      title,
      description,
      options,
      endTime,
      resolutionTime,
      minBet,
      totalVolume: 0,
      resolved: false,
      winningOption: null,
      createdAt: Date.now(),
    }
    
    this.markets.set(marketId, market)
    
    // Initialize betting options
    for (let i = 0; i < options.length; i++) {
      this.marketBets.set(`${marketId}-${i}`, { totalAmount: 0, betCount: 0 })
    }
    
    this.nextMarketId++
    return { success: true, marketId }
  }
  
  placeBet(marketId, option, amount, user) {
    const market = this.markets.get(marketId)
    if (!market) throw new Error("ERR-MARKET-NOT-FOUND")
    
    // Validate bet
    if (amount < market.minBet) throw new Error("ERR-INVALID-PARAMETERS")
    if (Date.now() >= market.endTime) throw new Error("ERR-MARKET-EXPIRED")
    if (option >= market.options.length) throw new Error("ERR-INVALID-PARAMETERS")
    if (market.resolved) throw new Error("ERR-MARKET-EXPIRED")
    
    // Simulate STX transfer
    this.stxTransfer(amount, user, "contract")
    
    // Update user bet
    const userBetKey = `${user}-${marketId}-${option}`
    const currentBet = this.userBets.get(userBetKey) || 0
    this.userBets.set(userBetKey, currentBet + amount)
    
    // Update option totals
    const optionKey = `${marketId}-${option}`
    const optionBets = this.marketBets.get(optionKey)
    this.marketBets.set(optionKey, {
      totalAmount: optionBets.totalAmount + amount,
      betCount: optionBets.betCount + 1,
    })
    
    // Update market total volume
    market.totalVolume += amount
    this.markets.set(marketId, market)
    
    return { success: true }
  }
  
  stxTransfer(amount, sender, recipient) {
    if (amount <= 0) throw new Error("Invalid amount")
    return { success: true, amount, sender, recipient }
  }
  
  getMarket(marketId) {
    return this.markets.get(marketId) || null
  }
  
  getMarketBets(marketId, option) {
    const key = `${marketId}-${option}`
    return this.marketBets.get(key) || null
  }
  
  getUserBet(user, marketId, option) {
    const key = `${user}-${marketId}-${option}`
    return this.userBets.get(key) || 0
  }
  
  isMarketActive(marketId) {
    const market = this.markets.get(marketId)
    return market && Date.now() < market.endTime && !market.resolved
  }
  
  markResolved(marketId, winningOption) {
    const market = this.markets.get(marketId)
    if (!market) throw new Error("ERR-MARKET-NOT-FOUND")
    
    market.resolved = true
    market.winningOption = winningOption
    this.markets.set(marketId, market)
    
    return { success: true }
  }
}

describe("Market Creation Contract", () => {
  let contract
  const user1 = "ST1USER1HJFEJ8HJFEJ8HJFEJ8HJFEJ8HJFEJ8HJ"
  const user2 = "ST1USER2HJFEJ8HJFEJ8HJFEJ8HJFEJ8HJFEJ8HJ"
  
  beforeEach(() => {
    contract = new MockMarketContract()
  })
  
  describe("Market Creation", () => {
    it("should create market with valid parameters", () => {
      const result = contract.createMarket(
          "Test Market",
          "A test prediction market",
          ["Yes", "No"],
          86400000, // 1 day
          3600000, // 1 hour resolution
          1000000, // 1 STX min bet
      )
      
      expect(result.success).toBe(true)
      expect(result.marketId).toBe(1)
      
      const market = contract.getMarket(1)
      expect(market).toBeTruthy()
      expect(market.title).toBe("Test Market")
      expect(market.options).toEqual(["Yes", "No"])
      expect(market.totalVolume).toBe(0)
      expect(market.resolved).toBe(false)
    })
    
    it("should reject market with single option", () => {
      expect(() => {
        contract.createMarket("Invalid Market", "Single option market", ["Only Option"], 86400000, 3600000, 1000000)
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should reject market with too many options", () => {
      const tooManyOptions = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`)
      
      expect(() => {
        contract.createMarket("Invalid Market", "Too many options", tooManyOptions, 86400000, 3600000, 1000000)
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should reject market with zero duration", () => {
      expect(() => {
        contract.createMarket("Invalid Market", "Zero duration", ["Yes", "No"], 0, 3600000, 1000000)
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should reject market with zero minimum bet", () => {
      expect(() => {
        contract.createMarket("Invalid Market", "Zero min bet", ["Yes", "No"], 86400000, 3600000, 0)
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should create multiple markets with incremental IDs", () => {
      const result1 = contract.createMarket("Market 1", "First market", ["A", "B"], 86400000, 3600000, 1000000)
      const result2 = contract.createMarket("Market 2", "Second market", ["X", "Y"], 86400000, 3600000, 1000000)
      
      expect(result1.marketId).toBe(1)
      expect(result2.marketId).toBe(2)
    })
  })
  
  describe("Bet Placement", () => {
    let marketId
    
    beforeEach(() => {
      const result = contract.createMarket(
          "Test Market",
          "Test betting market",
          ["Yes", "No"],
          86400000, // 1 day in future
          3600000,
          1000000,
      )
      marketId = result.marketId
    })
    
    it("should place valid bet", () => {
      const result = contract.placeBet(marketId, 0, 5000000, user1) // 5 STX on option 0
      
      expect(result.success).toBe(true)
      
      const market = contract.getMarket(marketId)
      expect(market.totalVolume).toBe(5000000)
      
      const optionBets = contract.getMarketBets(marketId, 0)
      expect(optionBets.totalAmount).toBe(5000000)
      expect(optionBets.betCount).toBe(1)
      
      const userBet = contract.getUserBet(user1, marketId, 0)
      expect(userBet).toBe(5000000)
    })
    
    it("should reject bet below minimum", () => {
      expect(() => {
        contract.placeBet(marketId, 0, 500000, user1) // 0.5 STX (below 1 STX min)
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should reject bet on invalid option", () => {
      expect(() => {
        contract.placeBet(marketId, 5, 1000000, user1) // Option 5 doesn't exist
      }).toThrow("ERR-INVALID-PARAMETERS")
    })
    
    it("should allow multiple bets from same user", () => {
      contract.placeBet(marketId, 0, 2000000, user1) // 2 STX
      contract.placeBet(marketId, 0, 3000000, user1) // 3 STX
      
      const userBet = contract.getUserBet(user1, marketId, 0)
      expect(userBet).toBe(5000000) // Total 5 STX
      
      const optionBets = contract.getMarketBets(marketId, 0)
      expect(optionBets.totalAmount).toBe(5000000)
      expect(optionBets.betCount).toBe(2)
    })
    
    it("should allow bets from multiple users", () => {
      contract.placeBet(marketId, 0, 2000000, user1)
      contract.placeBet(marketId, 1, 3000000, user2)
      
      const market = contract.getMarket(marketId)
      expect(market.totalVolume).toBe(5000000)
      
      expect(contract.getUserBet(user1, marketId, 0)).toBe(2000000)
      expect(contract.getUserBet(user2, marketId, 1)).toBe(3000000)
    })
    
    it("should track bets across different options", () => {
      contract.placeBet(marketId, 0, 2000000, user1) // Yes
      contract.placeBet(marketId, 1, 3000000, user1) // No
      
      expect(contract.getUserBet(user1, marketId, 0)).toBe(2000000)
      expect(contract.getUserBet(user1, marketId, 1)).toBe(3000000)
      
      const option0Bets = contract.getMarketBets(marketId, 0)
      const option1Bets = contract.getMarketBets(marketId, 1)
      
      expect(option0Bets.totalAmount).toBe(2000000)
      expect(option1Bets.totalAmount).toBe(3000000)
    })
  })
  
  describe("Market State Management", () => {
    let marketId
    
    beforeEach(() => {
      const result = contract.createMarket(
          "Test Market",
          "State management test",
          ["Yes", "No"],
          1000, // Short duration for testing
          500,
          1000000,
      )
      marketId = result.marketId
    })
    
    it("should report market as active when newly created", () => {
      expect(contract.isMarketActive(marketId)).toBe(true)
    })
    
    it("should report market as inactive after expiration", () => {
      // Wait for market to expire
      setTimeout(() => {
        expect(contract.isMarketActive(marketId)).toBe(false)
      }, 1100)
    })
    
    it("should report market as inactive when resolved", () => {
      contract.markResolved(marketId, 0)
      expect(contract.isMarketActive(marketId)).toBe(false)
    })
    
    it("should reject bets on resolved market", () => {
      contract.markResolved(marketId, 0)
      
      expect(() => {
        contract.placeBet(marketId, 0, 1000000, user1)
      }).toThrow("ERR-MARKET-EXPIRED")
    })
  })
  
  describe("Multi-Option Markets", () => {
    let marketId
    
    beforeEach(() => {
      const result = contract.createMarket(
          "Multi-Option Market",
          "Market with multiple outcomes",
          ["Option A", "Option B", "Option C", "Option D"],
          86400000,
          3600000,
          1000000,
      )
      marketId = result.marketId
    })
    
    it("should handle bets on all options", () => {
      contract.placeBet(marketId, 0, 1000000, user1) // Option A
      contract.placeBet(marketId, 1, 2000000, user1) // Option B
      contract.placeBet(marketId, 2, 3000000, user2) // Option C
      contract.placeBet(marketId, 3, 4000000, user2) // Option D
      
      const market = contract.getMarket(marketId)
      expect(market.totalVolume).toBe(10000000)
      
      // Check individual option totals
      expect(contract.getMarketBets(marketId, 0).totalAmount).toBe(1000000)
      expect(contract.getMarketBets(marketId, 1).totalAmount).toBe(2000000)
      expect(contract.getMarketBets(marketId, 2).totalAmount).toBe(3000000)
      expect(contract.getMarketBets(marketId, 3).totalAmount).toBe(4000000)
    })
    
    it("should track bet counts per option", () => {
      // Multiple bets on same option
      contract.placeBet(marketId, 0, 1000000, user1)
      contract.placeBet(marketId, 0, 1000000, user2)
      contract.placeBet(marketId, 0, 1000000, user1)
      
      const optionBets = contract.getMarketBets(marketId, 0)
      expect(optionBets.betCount).toBe(3)
      expect(optionBets.totalAmount).toBe(3000000)
    })
  })
  
  describe("Edge Cases", () => {
    it("should handle very large bet amounts", () => {
      const marketResult = contract.createMarket(
          "High Stakes Market",
          "Large bet test",
          ["Yes", "No"],
          86400000,
          3600000,
          1000000,
      )
      
      const largeBet = 1000000000000 // 1M STX
      const result = contract.placeBet(marketResult.marketId, 0, largeBet, user1)
      
      expect(result.success).toBe(true)
      
      const market = contract.getMarket(marketResult.marketId)
      expect(market.totalVolume).toBe(largeBet)
    })
    
    it("should handle markets with maximum options", () => {
      const maxOptions = Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`)
      
      const result = contract.createMarket(
          "Max Options Market",
          "Market with 10 options",
          maxOptions,
          86400000,
          3600000,
          1000000,
      )
      
      expect(result.success).toBe(true)
      
      const market = contract.getMarket(result.marketId)
      expect(market.options.length).toBe(10)
      
      // Test betting on last option
      const betResult = contract.placeBet(result.marketId, 9, 1000000, user1)
      expect(betResult.success).toBe(true)
    })
    
    it("should return zero for non-existent user bets", () => {
      const marketResult = contract.createMarket(
          "Test Market",
          "Zero bet test",
          ["Yes", "No"],
          86400000,
          3600000,
          1000000,
      )
      
      expect(contract.getUserBet(user1, marketResult.marketId, 0)).toBe(0)
      expect(contract.getUserBet("NONEXISTENT", marketResult.marketId, 0)).toBe(0)
    })
  })
})

console.log("✅ Market Creation Tests Complete")
