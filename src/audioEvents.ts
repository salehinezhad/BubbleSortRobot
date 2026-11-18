export type AudioEventName =
  | 'prepare'
  | 'compare'
  | 'swap'
  | 'jump'
  | 'flip'
  | 'land'
  | 'passComplete'
  | 'success'
  | 'wrongAnswer'
  | 'correctAnswer'

/*
 * هر رویداد می‌تواند در آینده با یک فایل واقعی جایگزین شود. وقتی مسیر null
 * باشد، موتور سبک Web Audio افکت همان رویداد را به‌صورت محلی می‌سازد.
 */
export const AUDIO_EVENT_SOURCES: Record<AudioEventName, string | null> = {
  prepare: null,
  compare: null,
  swap: null,
  jump: null,
  flip: null,
  land: null,
  passComplete: null,
  success: null,
  wrongAnswer: null,
  correctAnswer: null,
}

const activeAudio = new Set<HTMLAudioElement>()
let context: AudioContext | null = null
let masterGain: GainNode | null = null
let effectsGain: GainNode | null = null
let musicGain: GainNode | null = null
let audioEnabled = false
let musicEnabled = false
let musicPaused = false
let outputVolume = 0.65
let musicTimer: number | null = null
let musicStep = 0

const MUSIC_NOTES = [220, 277.18, 329.63, 415.3, 329.63, 277.18, 246.94, 329.63]

function ensureAudioGraph() {
  if (typeof window === 'undefined') return null
  if (context && masterGain && effectsGain && musicGain) return context

  context = new AudioContext()
  masterGain = context.createGain()
  effectsGain = context.createGain()
  musicGain = context.createGain()

  masterGain.gain.value = outputVolume
  effectsGain.gain.value = 0.72
  musicGain.gain.value = 0.16
  effectsGain.connect(masterGain)
  musicGain.connect(masterGain)
  masterGain.connect(context.destination)
  return context
}

function wakeAudio() {
  const audioContext = ensureAudioGraph()
  if (audioContext?.state === 'suspended') void audioContext.resume()
  return audioContext
}

function tone(
  frequency: number,
  delay: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  endFrequency = frequency,
  destination: GainNode | null = effectsGain,
) {
  const audioContext = context
  if (!audioContext || !destination) return

  const start = audioContext.currentTime + delay
  const oscillator = audioContext.createOscillator()
  const envelope = audioContext.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(Math.max(30, frequency), start)
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(30, endFrequency),
    start + duration,
  )
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration / 3))
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope)
  envelope.connect(destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function noise(delay: number, duration: number, volume: number, cutoff: number) {
  const audioContext = context
  if (!audioContext || !effectsGain) return

  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration))
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length)
  }

  const source = audioContext.createBufferSource()
  const filter = audioContext.createBiquadFilter()
  const envelope = audioContext.createGain()
  const start = audioContext.currentTime + delay
  source.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  envelope.gain.setValueAtTime(volume, start)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(effectsGain)
  source.start(start)
}

function synthesize(event: AudioEventName) {
  switch (event) {
    case 'prepare':
      tone(230, 0, 0.12, 0.08, 'triangle', 520)
      break
    case 'compare':
      tone(520, 0, 0.055, 0.045, 'sine', 640)
      tone(720, 0.065, 0.045, 0.03)
      break
    case 'swap':
      tone(360, 0, 0.1, 0.05, 'triangle', 520)
      tone(520, 0.04, 0.12, 0.04, 'triangle', 360)
      break
    case 'jump':
      tone(210, 0, 0.2, 0.075, 'sine', 820)
      break
    case 'flip':
      tone(520, 0, 0.065, 0.04, 'square', 760)
      tone(760, 0.06, 0.065, 0.035, 'square', 980)
      break
    case 'land':
      tone(150, 0, 0.13, 0.09, 'sine', 72)
      noise(0, 0.075, 0.035, 650)
      break
    case 'passComplete':
      tone(440, 0, 0.12, 0.055, 'triangle')
      tone(554.37, 0.1, 0.12, 0.05, 'triangle')
      tone(659.25, 0.2, 0.16, 0.055, 'triangle')
      break
    case 'correctAnswer':
      tone(523.25, 0, 0.1, 0.06, 'sine')
      tone(659.25, 0.085, 0.12, 0.06, 'sine')
      tone(783.99, 0.17, 0.17, 0.055, 'sine')
      break
    case 'wrongAnswer':
      tone(185, 0, 0.16, 0.055, 'sawtooth', 138)
      tone(155, 0.13, 0.2, 0.05, 'sawtooth', 105)
      break
    case 'success':
      ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        tone(frequency, index * 0.11, 0.24, 0.065, 'triangle')
      })
      tone(523.25, 0.46, 0.5, 0.045, 'sine')
      tone(659.25, 0.46, 0.5, 0.04, 'sine')
      tone(783.99, 0.46, 0.5, 0.04, 'sine')
      break
  }
}

function musicPulse() {
  if (!audioEnabled || !musicEnabled || musicPaused) return
  const audioContext = wakeAudio()
  if (!audioContext || !musicGain) return

  const note = MUSIC_NOTES[musicStep % MUSIC_NOTES.length]
  const bass = MUSIC_NOTES[Math.floor(musicStep / 2) % MUSIC_NOTES.length] / 2
  tone(note, 0, 0.3, 0.055, 'triangle', note * 1.005, musicGain)
  if (musicStep % 2 === 0) tone(bass, 0, 0.58, 0.035, 'sine', bass, musicGain)
  musicStep += 1
}

function stopMusicTimer() {
  if (musicTimer !== null) window.clearInterval(musicTimer)
  musicTimer = null
}

function startMusicTimer() {
  if (!audioEnabled || !musicEnabled || musicPaused || musicTimer !== null) return
  musicPulse()
  musicTimer = window.setInterval(musicPulse, 390)
}

export function setAudioEnabled(enabled: boolean) {
  audioEnabled = enabled
  if (!enabled) {
    stopAudioEvents()
    stopMusicTimer()
    return
  }

  wakeAudio()
  startMusicTimer()
}

export function setAudioVolume(volume: number) {
  outputVolume = Math.min(1, Math.max(0, volume))
  const audioContext = context
  if (audioContext && masterGain) {
    masterGain.gain.setTargetAtTime(outputVolume, audioContext.currentTime, 0.025)
  }
}

export function setMusicEnabled(enabled: boolean) {
  musicEnabled = enabled
  if (!enabled) {
    stopMusicTimer()
    return
  }

  musicPaused = false
  wakeAudio()
  startMusicTimer()
}

export function pauseBackgroundMusic() {
  musicPaused = true
  stopMusicTimer()
}

export function resumeBackgroundMusic() {
  musicPaused = false
  startMusicTimer()
}

export function emitAudioEvent(event: AudioEventName, enabled = audioEnabled) {
  const source = AUDIO_EVENT_SOURCES[event]
  if (!enabled) return

  wakeAudio()
  if (!source) {
    synthesize(event)
    return
  }

  const audio = new Audio(source)
  audio.volume = outputVolume
  activeAudio.add(audio)
  audio.addEventListener('ended', () => activeAudio.delete(audio), { once: true })
  audio.addEventListener('error', () => activeAudio.delete(audio), { once: true })
  void audio.play().catch(() => activeAudio.delete(audio))
}

export function stopAudioEvents() {
  activeAudio.forEach((audio) => {
    audio.pause()
    audio.currentTime = 0
  })
  activeAudio.clear()
}

export function shutdownAudio() {
  stopAudioEvents()
  stopMusicTimer()
  if (context) void context.close()
  context = null
  masterGain = null
  effectsGain = null
  musicGain = null
}
