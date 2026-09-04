export type SecretVault = {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(cipher: Buffer): string | undefined
}

export function sealToken(vault: SecretVault, token: string) {
  if (!vault.isEncryptionAvailable()) return
  return vault.encryptString(token).toString("base64")
}

export function openToken(vault: SecretVault, ciphertext: string) {
  if (!vault.isEncryptionAvailable()) return
  return vault.decryptString(Buffer.from(ciphertext, "base64"))
}

export function memoryVault(available = true): SecretVault {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, "utf8"),
    decryptString: (cipher) => {
      const text = cipher.toString("utf8")
      if (!text.startsWith("enc:")) return
      return text.slice(4)
    },
  }
}
