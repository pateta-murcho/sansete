import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CustomerState {
  name: string
  whatsapp: string
  neighborhood: string
  address: string
  set: (data: Partial<Pick<CustomerState, 'name' | 'whatsapp' | 'neighborhood' | 'address'>>) => void
}

export const useCustomer = create<CustomerState>()(
  persist(
    (set) => ({
      name: '',
      whatsapp: '',
      neighborhood: '',
      address: '',
      set: (data) => set(data),
    }),
    { name: 'sonset_customer' }
  )
)
