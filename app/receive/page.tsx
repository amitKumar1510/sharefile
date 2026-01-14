"use client"
import { useState } from "react"
import { createPeer } from "../lib/webrtc"

const MEMORY_THRESHOLD_MB = 20
const MEMORY_THRESHOLD_BYTES = MEMORY_THRESHOLD_MB * 1024 * 1024

export default function ReceivePage() {
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [fileName, setFileName] = useState<string | null>(null)
  const [remoteSize, setRemoteSize] = useState<number | null>(null)
  const [status, setStatus] = useState<string>("Enter code and start download")

  async function receive(code: string) {
    if (!code || code.length !== 8) {
      setStatus("Please enter a valid 8-digit code")
      return
    }

    setStatus("Connecting...")
    const pc = createPeer()

    setFileName(null)
    setRemoteSize(null)
    setProgress(0)
    setSpeed(0)

    let fileSize = 0
    let receivedBytes = 0
    let localFileName = "download"
    let writable: FileSystemWritableFileStream | null = null
    const chunks: BlobPart[] = []
    const startTime = Date.now()

    const supportsDirectWrite = "showSaveFilePicker" in window

    let useDirectDisk = false

    pc.ondatachannel = (e) => {
      console.log("ondatachannel fired! Label:", e.channel.label)
      const channel = e.channel

      channel.binaryType = "arraybuffer"
      channel.onopen = () => console.log("Data channel open on receiver")
      channel.onclose = () => console.log("Data channel closed on receiver")
      channel.onerror = (ev) => console.error("Data channel error on receiver:", ev)

      channel.onmessage = (msg) => {
        console.log(
          "Message received | type:",
          typeof msg.data,
          "size:",
          msg.data?.byteLength ?? msg.data?.length ?? "unknown"
        )

        if (typeof msg.data === "string") {
          if (msg.data === "EOF") {
            console.log("EOF received")

            if (useDirectDisk && writable) {
              const flush = async () => {
                if (chunks.length > 0) {
                    console.log("Flushing final", chunks.length, "chunks to disk")
                    if (writable) {
                      for (const chunk of chunks) {
                        await writable.write(chunk)
                      }
                    }
                    chunks.length = 0
                  }
                  if (writable) await writable.close()
                setStatus("Download complete! File saved to disk.")
                alert("Download complete!")
              }
              flush().catch((err) => {
                console.error("Final flush failed:", err)
                setStatus("Error finalizing file")
              })
            } else if (chunks.length > 0) {
              const blob = new Blob(chunks)
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = localFileName
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
              setStatus(`Download complete (${MEMORY_THRESHOLD_MB} MB or less → browser save)`)
              alert("Download complete!")
            }

            channel.close()
            return
          }

          try {
            const meta = JSON.parse(msg.data)
            if (meta.type === "meta") {
              console.log("Metadata:", meta)
              localFileName = meta.name
              fileSize = meta.size
              setFileName(meta.name)
              setRemoteSize(meta.size)

              useDirectDisk = fileSize > MEMORY_THRESHOLD_BYTES && supportsDirectWrite

              if (useDirectDisk) {
                setStatus(`Large file → preparing direct disk save...`);
                (window as any).showSaveFilePicker({
                  suggestedName: localFileName,
                  types: [{ description: "All Files" }],
                })
                  .then((handle: any) => handle.createWritable())
                  .then((stream: any) => {
                    writable = stream
                    setStatus("Streaming directly to disk...")

                    if (chunks.length > 0) {
                      console.log("Flushing early chunks:", chunks.length)
                      const flushEarly = async () => {
                        if (!writable) return
                        for (const chunk of chunks) {
                          await writable.write(chunk)
                        }
                        chunks.length = 0
                      }
                      flushEarly().catch((err) => console.error("Early flush error:", err))
                    }
                  })
                  .catch((err: any) => {
                    console.error("Picker error:", err)
                    useDirectDisk = false
                    writable = null
                    setStatus(
                      err.name === "AbortError"
                        ? "Save canceled → receiving in memory"
                        : "Direct save failed → using memory"
                    )
                  })
              } else {
                setStatus(
                  fileSize <= MEMORY_THRESHOLD_BYTES
                    ? `Small file → collecting in memory`
                    : `Collecting in memory (direct save not available)`
                )
              }
            }
          } catch (err) {
            console.error("Metadata parse error:", err)
          }
          return
        }

        // Binary chunk
        const byteLen = msg.data.byteLength || 0
        receivedBytes += byteLen
        console.log(`Binary chunk: ${byteLen} bytes, total: ${receivedBytes}/${fileSize || "?"}`)

        chunks.push(msg.data)

        if (useDirectDisk && writable) {
          writable.write(msg.data).catch((err) => console.error("Write error:", err))
        }

        if (fileSize > 0) {
          setProgress(Math.floor((receivedBytes / fileSize) * 100))
          const elapsed = (Date.now() - startTime) / 1000
          if (elapsed > 0) {
            setSpeed(Number(((receivedBytes / 1024 / 1024) / elapsed).toFixed(2)))
          }
        }
      }
    }

    try {
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          fetch("/api/signal", {
            method: "POST",
            body: JSON.stringify({ type: "ice", code, data: e.candidate })
          }).catch(console.error)
        }
      }

      const res = await fetch(`/api/signal?code=${code}&role=receiver`)
      if (!res.ok) throw new Error(`Signaling failed: ${res.status}`)
      const { offer, ice } = await res.json()
      if (!offer?.sdp) {
        throw new Error("Invalid SDP received")
      }
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await fetch("/api/signal", {
        method: "POST",
        body: JSON.stringify({ type: "answer", code, data: answer })
      })

      ice.forEach((c:any) => pc.addIceCandidate(c).catch(console.error))
    } catch (err) {
      console.error("Connection error:", err)
      setStatus("Connection failed – check console")
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Receive File</h2>
      <input
        id="code"
        placeholder="Enter 8-digit code"
        style={{ padding: "0.5rem", width: "180px", marginRight: "1rem" }}
      />
      <button
        onClick={() => {
          const el = document.getElementById("code") as HTMLInputElement
          if (el) receive(el.value.trim())
        }}
        style={{ padding: "0.5rem 1rem" }}
      >
        Start Download
      </button>

      <p style={{ marginTop: "1.5rem", fontWeight: "bold" }}>{status}</p>

      {fileName && (
        <p>
          File: <strong>{fileName}</strong>{" "}
          {remoteSize ? `(${(remoteSize / 1024 / 1024).toFixed(2)} MB)` : ""}
        </p>
      )}
      <progress
        value={progress}
        max={100}
        style={{ width: "100%", height: "20px", margin: "1rem 0" }}
      />
      <p>
        {progress}% — {speed.toFixed(2)} MB/s
      </p>
    </div>
  )
}