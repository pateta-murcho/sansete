import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Catalogo from './pages/Catalogo'
import ProdutoDetalhe from './pages/ProdutoDetalhe'
import Carrinho from './pages/Carrinho'
import Checkout from './pages/Checkout'
import Pagamento from './pages/Pagamento'
import Consultar from './pages/Consultar'
import AdminLogin from './pages/admin/AdminLogin'
import AdminPedidos from './pages/admin/AdminPedidos'
import AdminProdutos from './pages/admin/AdminProdutos'
import AdminMotoboys from './pages/admin/AdminMotoboys'
import AdminFrete from './pages/admin/AdminFrete'
import AdminFinanceiro from './pages/admin/AdminFinanceiro'
import AdminSenha from './pages/admin/AdminSenha'
import MotoboyLogin from './pages/motoboy/MotoboyLogin'
import MotoboyFila from './pages/motoboy/MotoboyFila'
import MotoboyFinanceiro from './pages/motoboy/MotoboyFinanceiro'
import MotoboyConta from './pages/motoboy/MotoboyConta'
import AdminLayout from './components/layout/AdminLayout'
import MotoboyLayout from './components/layout/MotoboyLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/produto/:id" element={<ProdutoDetalhe />} />
        <Route path="/carrinho" element={<Carrinho />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pagamento/:orderId" element={<Pagamento />} />
        <Route path="/consultar" element={<Consultar />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/pedidos" replace />} />
          <Route path="pedidos" element={<AdminPedidos />} />
          <Route path="produtos" element={<AdminProdutos />} />
          <Route path="motoboys" element={<AdminMotoboys />} />
          <Route path="frete" element={<AdminFrete />} />
          <Route path="financeiro" element={<AdminFinanceiro />} />
          <Route path="senha" element={<AdminSenha />} />
        </Route>

        <Route path="/motoboy/login" element={<MotoboyLogin />} />
        <Route path="/motoboy" element={<MotoboyLayout />}>
          <Route index element={<MotoboyFila />} />
          <Route path="financeiro" element={<MotoboyFinanceiro />} />
          <Route path="conta" element={<MotoboyConta />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
