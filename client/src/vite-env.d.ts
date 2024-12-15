/// <reference types="vite/client" />

declare interface AuthContextType {
    isAuthenticatied: boolean
    login?: (email: string, password: string) => void
    signup?: (username: string, email: string, password: string) => void
    logout?: () => void
}

declare interface Config {
    walletCount?: number
    txFee?: number
    minBNB?: number
    maxBNB?: number
    minToken?: number
    maxToken?: number
    intervalMin?: number
    intervalMax?: number
    bnbLimit?: number
    tokenLimit?: number
}