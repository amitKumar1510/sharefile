"use client"
import Link from "next/link"

export default function HomePage() {
  return (
    <div style={{ textAlign: "center" }}>
      <h2>Welcome to WebRTC File Transfer</h2>
      <p>Send large files (up to 10GB) directly between browsers using an 8-digit code.</p>

      <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: "2rem" }}>
        <Link href="/send">
          <button style={{ backgroundColor: "#1e40af", color: "white" }}>Send File</button>
        </Link>

        <Link href="/receive">
          <button style={{ backgroundColor: "#059669", color: "white" }}>Receive File</button>
        </Link>
      </div>
    </div>
  )
}
