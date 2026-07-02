import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import Logo from '../components/ui/Logo'

export default function Landing() {
  return (
    <main className="min-h-screen bg-son-black text-white overflow-hidden relative">
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-son-orange/20 blur-[120px]" />
      <div className="absolute top-20 -right-40 w-96 h-96 rounded-full bg-son-purple/25 blur-[120px]" />
      <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-son-pink/15 blur-[120px]" />

      <header className="relative z-10 px-6 sm:px-10 py-6 flex items-center justify-between max-w-6xl mx-auto">
        <Logo size="md" />
        <Link to="/consultar" className="flex items-center gap-1.5 text-sm font-medium text-son-silver hover:text-white transition-colors">
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Acompanhar pedido</span>
        </Link>
      </header>

      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-semibold text-son-gold mb-6"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Peça em minutos, receba no seu bairro
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]"
        >
          Bem-vindo à <span className="sunset-text">Sonset</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-son-silver text-base sm:text-lg mt-5 max-w-xl mx-auto"
        >
          Escolha seus produtos, pague no Pix e acompanhe cada etapa do pedido em tempo real —
          direto pelo WhatsApp.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link to="/catalogo" className="btn-primary text-base px-8 py-4 w-full sm:w-auto">
            Ver catálogo
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/consultar" className="btn-secondary text-base px-8 py-4 w-full sm:w-auto">
            Acompanhar meu pedido
          </Link>
        </motion.div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pb-24 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: 'Catálogo completo', desc: 'Grade ou lista, do seu jeito, com estoque em tempo real.' },
          { title: 'Pix instantâneo', desc: 'QR code na hora, sem precisar sair da conversa.' },
          { title: 'Rastreio pelo WhatsApp', desc: 'Saiba exatamente quando seu pedido sai para entrega.' },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="glass rounded-2xl p-6 text-left"
          >
            <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
            <p className="text-sm text-son-silver-dim">{f.desc}</p>
          </motion.div>
        ))}
      </section>
    </main>
  )
}
