import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { generateCode } from "../../lib/session"

let redis: Redis | null = null

function getRedis() {
  if (redis) return redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    throw new Error("Upstash Redis env vars missing at runtime")
  }

  redis = new Redis({ url, token })
  return redis
}

const TTL = 300
const sessionKey = (code: string, key: string) => `session:${code}:${key}`

function safeJSON<T = any>(raw: any): T | null {
  if (!raw) return null
  if (typeof raw === "string") {
    try { return JSON.parse(raw) } catch { return null }
  }
  return raw
}

export async function POST(req: Request) {
  const redis = getRedis()
  const { type, code, data } = await req.json()

  if (type === "create") {
    const newCode = generateCode()
    await redis.set(sessionKey(newCode, "meta"), "1", { ex: TTL })
    return NextResponse.json({ code: newCode })
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 })
  }

  const meta = await redis.get(sessionKey(code, "meta"))
  if (!meta) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 })
  }

  if (type === "offer" || type === "answer") {
    if (!data || typeof data.sdp !== "string" || typeof data.type !== "string") {
      return NextResponse.json({ error: `Invalid ${type}` }, { status: 400 })
    }

    await redis.set(
      sessionKey(code, type),
      JSON.stringify({ type: data.type, sdp: data.sdp }),
      { ex: TTL }
    )

    return NextResponse.json({ ok: true })
  }

  if (type === "ice") {
    try {
      await redis.rpush(sessionKey(code, "ice"), JSON.stringify(data))
      await redis.expire(sessionKey(code, "ice"), TTL)
      return NextResponse.json({ ok: true })
    } catch {
      return NextResponse.json({ error: "Failed to store ICE" }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 })
}

export async function GET(req: Request) {
  const redis = getRedis()
  const { searchParams } = new URL(req.url)

  const code = searchParams.get("code")
  const role = searchParams.get("role")

  if (!code || !role) return NextResponse.json({})

  const meta = await redis.get(sessionKey(code, "meta"))
  if (!meta) return NextResponse.json({})

  if (role === "receiver") {
    const offer = safeJSON(await redis.get(sessionKey(code, "offer")))
    const rawIce = await redis.lrange(sessionKey(code, "ice"), 0, -1).catch(() => [])
    const ice = rawIce.map(safeJSON).filter(Boolean)

    return NextResponse.json({ offer, ice })
  }

  if (role === "sender") {
    const answer = safeJSON(await redis.get(sessionKey(code, "answer")))
    return NextResponse.json({ answer })
  }

  return NextResponse.json({})
}






// import { NextResponse } from "next/server"
// import { Redis } from "@upstash/redis"
// import { sessions, generateCode } from "../../lib/session"


// export async function POST(req: Request) {
//   const body = await req.json()
//   const { type, code, data } = body

//   if (type === "create") {
//     const newCode = generateCode()
//     sessions.set(newCode, { ice: [] })
//     return NextResponse.json({ code: newCode })
//   }

//   const session = sessions.get(code)
//   if (!session) return NextResponse.json({ error: "Invalid code" }, { status: 404 })

//   if (type === "offer") session.offer = data
//   if (type === "answer") session.answer = data
//   if (type === "ice") session.ice.push(data)

//   return NextResponse.json({ status: "ok" })
// }

// export async function GET(req: Request) {
//   const { searchParams } = new URL(req.url)
//   const code = searchParams.get("code")!
//   const role = searchParams.get("role")!

//   const session = sessions.get(code)
//   if (!session) return NextResponse.json({})

//   if (role === "receiver") return NextResponse.json({ offer: session.offer, ice: session.ice })
//   if (role === "sender") return NextResponse.json({ answer: session.answer })

//   return NextResponse.json({})
// }
