import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AppProviders } from './app/providers'
import { router } from './app/router'
import { reloadOnce } from './app/RouteError'
import './app/index.css'

// Vite báo không tải trước được tệp JS của trang (web vừa có bản mới, tab đang giữ bản cũ): tải lại một lần để lấy bản mới.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>,
)
