"use client"
import { useState } from "react"
import { createPeer } from "../lib/webrtc"

const CHUNK_SIZE = 256 * 1024
const MAX_BUFFER = 8 * 1024 * 1024

export default function SendPage() {
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [code, setCode] = useState("")

  async function start(file: File) {
    try {
      const res = await fetch("/api/signal", {
        method: "POST",
        body: JSON.stringify({ type: "create" })
      })
      if (!res.ok) throw new Error("Failed to create code")
      const data = await res.json()
      setCode(data.code)

      const pc = createPeer()
      const channel = pc.createDataChannel("file", { ordered: true })

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          fetch("/api/signal", {
            method: "POST",
            body: JSON.stringify({ type: "ice", code: data.code, data: e.candidate })
          }).catch(console.error)
        }
      }

      let resumeSending: () => void = () => {}

      channel.onbufferedamountlow = () => {
        console.log("Sender: buffered low, current:", channel.bufferedAmount)
        resumeSending()
      }

      channel.onopen = async () => {
        console.log("Sender: channel open")
        channel.binaryType = "arraybuffer"

        // Small delay to help receiver attach handlers
        await new Promise(r => setTimeout(r, 300))

        channel.send(JSON.stringify({
          type: "meta",
          name: file.name,
          size: file.size
        }))

        let offset = 0
        let sentBytes = 0
        const startTime = Date.now()

        channel.bufferedAmountLowThreshold = 128 * 1024

        resumeSending = async () => {
          while (offset < file.size && channel.bufferedAmount < channel.bufferedAmountLowThreshold * 2) {
            const slice = file.slice(offset, offset + CHUNK_SIZE)
            const buffer = await slice.arrayBuffer()

            if (channel.bufferedAmount > MAX_BUFFER) {
              console.log("Sender: buffer high, pausing")
              return
            }

            try {
              channel.send(buffer)
              console.log(`Sender: sent chunk offset=${offset}, size=${buffer.byteLength}, buffered=${channel.bufferedAmount}`)
            } catch (err) {
              console.error("Sender: send failed:", err)
              return
            }

            offset += buffer.byteLength
            sentBytes += buffer.byteLength

            setProgress(Math.floor((sentBytes / file.size) * 100))
            const elapsed = Math.max((Date.now() - startTime) / 1000, 0.001)
            setSpeed(Number((sentBytes / 1024 / 1024 / elapsed).toFixed(2)))
          }

          if (offset >= file.size) {
            channel.send("EOF")
            console.log("Sender: EOF sent")
            channel.onbufferedamountlow = null
          }
        }

        resumeSending()
      }

      channel.onclose = () => console.log("Sender: channel closed")
      channel.onerror = (ev) => console.error("Sender channel error:", ev)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await fetch("/api/signal", {
        method: "POST",
        body: JSON.stringify({ type: "offer", code: data.code, data: offer })
      })

      const timer = setInterval(async () => {
        const res = await fetch(`/api/signal?code=${data.code}&role=sender`)
        const ans = await res.json()
        if (ans.answer) {
          await pc.setRemoteDescription(ans.answer)
          clearInterval(timer)
        }
      }, 800)
    } catch (err) {
      console.error("Sender error:", err)
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Send File</h2>
      <input
        type="file"
        onChange={e => e.target.files?.[0] && start(e.target.files[0])}
      />
      {code && <p>Share this code: <strong>{code}</strong></p>}
      <progress value={progress} max={100} style={{ width: "100%", height: "20px", margin: "1rem 0" }} />
      <p>{progress}% — {speed.toFixed(2)} MB/s</p>
    </div>
  )
}