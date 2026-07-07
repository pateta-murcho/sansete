import { MessageCircle } from 'lucide-react'

export default function WhatsAppLink({ phone, className }: { phone: string; className?: string }) {
  const digits = phone.replace(/\D/g, '')
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className ?? 'inline-flex items-center gap-1 hover:text-son-pink hover:underline'}
    >
      <MessageCircle className="w-3 h-3 flex-shrink-0" />
      {phone}
    </a>
  )
}
