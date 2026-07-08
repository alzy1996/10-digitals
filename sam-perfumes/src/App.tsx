import { useEffect, useState } from 'react'
import { I18nProvider } from './lib/i18n'
import { initScroll } from './lib/scroll'
import GrainOverlay from './components/GrainOverlay'
import Preloader from './components/Preloader'
import Hero from './sections/Hero'
import Collection from './sections/Collection'
import Story from './sections/Story'
import Signature from './sections/Signature'
import Order from './sections/Order'
import Footer from './sections/Footer'

function Site() {
  const [ready, setReady] = useState(false)

  useEffect(() => initScroll(), [])

  return (
    <>
      <Preloader onDone={() => setReady(true)} />
      <main>
        <Hero ready={ready} />
        <Collection />
        <Story />
        <Signature />
        <Order />
      </main>
      <Footer />
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
