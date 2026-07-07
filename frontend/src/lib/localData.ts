import type { Category, Motoboy, Order, Product, ShippingRate } from './types'

export const NEIGHBORHOODS = [
  'Aeroclube', 'Alto do Céu', 'Alto do Mateus', 'Anatólia', 'Água Fria',
  'Bairro das Indústrias', 'Bairro dos Estados', 'Bairro dos Ipês', 'Bancários',
  'Barra de Gramame', 'Bessa', 'Brisamar', 'Cabo Branco', 'Castelo Branco', 'Centro',
  'Cidade dos Colibris', 'Costa do Sol', 'Costa e Silva', 'Cristo Redentor',
  'Cruz das Armas', 'Cuiá', 'Distrito Industrial', 'Ernani Sátiro', 'Ernesto Geisel',
  'Expedicionários', 'Funcionários', 'Geisel', 'Gramame', 'Grotão', 'Ilha do Bispo',
  'Jaguaribe', 'Jardim Cidade Universitária', 'Jardim Oceania', 'Jardim São Paulo',
  'Jardim Veneza', 'José Pinheiro', 'Manaíra', 'Mandacaru', 'Mangabeira', 'Miramar',
  'Mumbaba', 'Muçumagro', 'Oitizeiro', 'Padre Zé', 'Paratibe', 'Pedro Gondim', 'Penha',
  'Planalto Boa Esperança', 'Portal do Sol', 'Praia do Bessa', 'Range', 'Roger',
  'São José', 'Tambaú', 'Tambauzinho', 'Tambiá', 'Torre', 'Treze de Maio',
  'Trincheiras', 'Valentina de Figueiredo', 'Varadouro', 'Varjão',
]

export interface LocalMotoboy extends Motoboy {
  password: string
}

export interface LocalDb {
  categories: Category[]
  products: Product[]
  motoboys: LocalMotoboy[]
  orders: Order[]
  shippingRates: ShippingRate[]
}

export const ADMIN_CREDENTIALS = { email: 'pablo2@gmail.com', password: '123456', name: 'Admin Sunset Tabas' }
export const FAKE_MOTOBOY_ID = 'local-motoboy-seed'

const STORAGE_KEY = 'sonset_local_db_v1'

function uid() {
  return crypto.randomUUID()
}

function nowIso() {
  return new Date().toISOString()
}

function seedDb(): LocalDb {
  const catBebidas = uid()
  const catLanches = uid()
  const catSobremesas = uid()

  const categories: Category[] = [
    { id: catBebidas, name: 'Bebidas' },
    { id: catLanches, name: 'Lanches' },
    { id: catSobremesas, name: 'Sobremesas' },
  ]

  const products: Product[] = [
    { id: uid(), name: 'Refrigerante Lata', description: 'Refrigerante gelado 350ml', price: 6.0, quantity: 50, image_url: null, category_id: catBebidas, active: true },
    { id: uid(), name: 'Suco Natural', description: 'Suco de frutas da estação 500ml', price: 8.5, quantity: 30, image_url: null, category_id: catBebidas, active: true },
    { id: uid(), name: 'Sanduíche Natural', description: 'Pão integral, frango desfiado e salada', price: 14.9, quantity: 20, image_url: null, category_id: catLanches, active: true },
    { id: uid(), name: 'Hambúrguer Artesanal', description: 'Pão brioche, carne 180g, queijo e molho da casa', price: 24.9, quantity: 15, image_url: null, category_id: catLanches, active: true },
    { id: uid(), name: 'Pudim de Leite', description: 'Fatia individual de pudim caseiro', price: 9.9, quantity: 25, image_url: null, category_id: catSobremesas, active: true },
    { id: uid(), name: 'Brownie com Sorvete', description: 'Brownie de chocolate com bola de sorvete', price: 12.9, quantity: 18, image_url: null, category_id: catSobremesas, active: true },
  ]

  const motoboys: LocalMotoboy[] = [
    {
      id: FAKE_MOTOBOY_ID,
      name: 'Motoboy Teste',
      phone: '83999990000',
      email: 'motoboy@sonset.com',
      password: 'motoboy123',
      active: true,
    },
  ]

  const shippingRates: ShippingRate[] = NEIGHBORHOODS.map((n) => ({ neighborhood: n, price: 0 }))

  return { categories, products, motoboys, orders: [], shippingRates }
}

export function loadDb(): LocalDb {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as LocalDb
    } catch {
      // corrupted, fall through to reseed
    }
  }
  const fresh = seedDb()
  saveDb(fresh)
  return fresh
}

export function saveDb(db: LocalDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export { uid, nowIso }
