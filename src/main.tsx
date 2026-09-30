import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { ensureDataVersion } from "@/lib/migrate"
import App from './App.tsx'

// 启动先跑数据版本检查/迁移（迁移前自动备份到 vocabrain_backup_vN）
ensureDataVersion()

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <TRPCProvider>
      <App />
    </TRPCProvider>
  </BrowserRouter>
)
