import { useEffect, useState } from 'react'
import { I18nProvider, useI18n } from './lib/i18n'
import { initScroll, refreshScroll } from './lib/scroll'
import GrainOverlay from './components/GrainOverlay'
import Preloader from './components/Preloader'
import Nav from './components/Nav'
import Hero from './sections/Hero'
import BestSellers from './sections/BestSellers'
import Collection from './sections/Collection'
import Story from './sections/Story'
import Signature from './sections/Signature'
import Order from './sections/Order'
import Footer from './sections/Footer'

function Site() {
  const [ready, setReady] = useState(false)
  const { lang } = useI18n()

  useEffect(() => initScroll(), [])
  useEffect(() => {
    const id = requestAnimationFrame(refreshScroll)
    return () => cancelAnimationFrame(id)
  }, [lang])

  return (
    <>
      <Preloader onDone={() => setReady(true)} />
      <Nav />
      <main>
        <Hero ready={ready} />
        <BestSellers />
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
