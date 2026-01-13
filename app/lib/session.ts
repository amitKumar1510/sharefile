type Session = {
  offer?: any
  answer?: any
  ice: any[]
}

export const sessions = new Map<string, Session>()

export function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString()
}
