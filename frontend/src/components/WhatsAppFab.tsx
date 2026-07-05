import logoSrc from '../assets/logo.png'

const WHATSAPP_URL =
  'https://api.whatsapp.com/send/?phone=5583987059373&text&type=phone_number&app_absent=0'

// Floating WhatsApp button — fixed to the viewport (follows scroll) with a
// small "typing…" bubble that bounces its three dots in a short burst every
// 4s, hinting this button is about messaging.
export default function WhatsAppFab() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 left-6 z-40 group"
      aria-label="Falar no WhatsApp"
    >
      <div className="w-16 h-16 rounded-full overflow-hidden bg-son-black glow group-hover:scale-105 transition-transform">
        <img src={logoSrc} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 bg-son-gold rounded-full px-1.5 py-1.5 shadow-md shadow-black/40">
        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot" style={{ animationDelay: '0s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot" style={{ animationDelay: '0.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-white typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
    </a>
  )
}
