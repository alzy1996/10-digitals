import { useCallback, useEffect, useRef, useState } from 'react'

/** In-app browsers (Instagram, Facebook, TikTok, Snapchat…) often block the camera. */
export function detectInAppBrowser() {
  const ua = navigator.userAgent || ''
  if (/Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly|Bytedance|Line\/|LinkedInApp|Twitter/i.test(ua)) return true
  return false
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext
}

export function useCamera() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [state, setState] = useState('idle') // idle | starting | live | denied | unsupported | error
  const [facing, setFacing] = useState('environment')
  const [torch, setTorch] = useState({ supported: false, on: false })

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  const start = useCallback(
    async (mode = facing) => {
      if (!cameraSupported()) {
        setState('unsupported')
        return false
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setState('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        })
        streamRef.current = stream
        const v = videoRef.current
        v.srcObject = stream
        v.muted = true
        v.playsInline = true
        await v.play()
        const track = stream.getVideoTracks()[0]
        const caps = track.getCapabilities ? track.getCapabilities() : {}
        setTorch({ supported: !!caps.torch, on: false })
        setFacing(mode)
        setState('live')
        return true
      } catch (e) {
        console.warn('[camera]', e)
        setState(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'error')
        return false
      }
    },
    [facing],
  )

  const flip = useCallback(() => start(facing === 'user' ? 'environment' : 'user'), [facing, start])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on }] })
      setTorch((t) => ({ ...t, on: !t.on }))
    } catch (e) {
      console.warn('[torch]', e)
    }
  }, [torch.on])

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), [])

  return { videoRef, state, facing, start, stop, flip, torch, toggleTorch, mirrored: facing === 'user' }
}

/** Phone tilt → [-1..1, -1..1] so cat-eye / glitter / chrome move like the real thing. */
export function useTilt() {
  const [tilt, setTilt] = useState([0, 0])
  const [enabled, setEnabled] = useState(false)
  const smooth = useRef([0, 0])

  useEffect(() => {
    if (!enabled) return
    const onOri = (e) => {
      const g = Math.max(-1, Math.min(1, (e.gamma || 0) / 35))
      const b = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 35))
      smooth.current = [smooth.current[0] * 0.8 + g * 0.2, smooth.current[1] * 0.8 + b * 0.2]
      setTilt([...smooth.current])
    }
    window.addEventListener('deviceorientation', onOri)
    return () => window.removeEventListener('deviceorientation', onOri)
  }, [enabled])

  const enable = useCallback(async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission() // iOS needs a tap
        if (r !== 'granted') return false
      }
      setEnabled(true)
      return true
    } catch {
      return false
    }
  }, [])

  return { tilt, setTilt, enabled, enable }
}

/** Load a user-picked image file (respects EXIF rotation in modern browsers). */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('bad_image'))
    }
    img.src = url
  })
}
