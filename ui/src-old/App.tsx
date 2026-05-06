import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useCunninghamTheme } from './cunningham/useCunninghamTheme'
import AppLayout from './layouts/AppLayout'
import Explorer from './pages/Explorer'
import Recent from './pages/Recent'
import Favorites from './pages/Favorites'
import Trash from './pages/Trash'
import Editor from './pages/Editor'

const queryClient = new QueryClient()

export default function App() {
  const { theme } = useCunninghamTheme()

  return (
    <CunninghamProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/explorer" replace />} />
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/explorer/:folderId" element={<Explorer />} />
              <Route path="/recent" element={<Recent />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/trash" element={<Trash />} />
            </Route>
            <Route path="/edit/:fileId" element={<Editor />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </CunninghamProvider>
  )
}
