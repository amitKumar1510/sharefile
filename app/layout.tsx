import './globals.css'

export const metadata = {
  title: 'WebRTC File Transfer',
  description: 'P2P browser-to-browser file transfer like Magic Wormhole',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <header className="header">
          Free File Share and Converter
        </header>
        
        <main className="main">{children}</main>
        <footer className="footer">
          &copy; 2026 P2P Transfer
        </footer>
      </body>
    </html>
  )
}






