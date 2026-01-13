import { NextResponse } from "next/server"
import { sessions, generateCode } from "../../lib/session"

export async function POST(req: Request) {
  const body = await req.json()
  const { type, code, data } = body

  if (type === "create") {
    const newCode = generateCode()
    sessions.set(newCode, { ice: [] })
    return NextResponse.json({ code: newCode })
  }

  const session = sessions.get(code)
  if (!session) return NextResponse.json({ error: "Invalid code" }, { status: 404 })

  if (type === "offer") session.offer = data
  if (type === "answer") session.answer = data
  if (type === "ice") session.ice.push(data)

  return NextResponse.json({ status: "ok" })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")!
  const role = searchParams.get("role")!

  const session = sessions.get(code)
  if (!session) return NextResponse.json({})

  if (role === "receiver") return NextResponse.json({ offer: session.offer, ice: session.ice })
  if (role === "sender") return NextResponse.json({ answer: session.answer })

  return NextResponse.json({})
}
