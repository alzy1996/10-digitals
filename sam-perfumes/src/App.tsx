import { useState } from 'react'
import { I18nProvider } from './lib/i18n'
import GrainOverlay from './components/GrainOverlay'
import Preloader from './components/Preloader'
import Hero from './sections/Hero'

function Site() {
  const [ready, setReady] = useState(false)

  return (
    <>
      <Preloader onDone={() => setReady(true)} />
      <main>
        <Hero ready={ready} />
      </main>
      <GrainOverlay />
    </>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <Site />
    </I18nProvider>
  )
}
