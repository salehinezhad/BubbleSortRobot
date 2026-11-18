import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import './App.css'
import {
  emitAudioEvent,
  pauseBackgroundMusic,
  resumeBackgroundMusic,
  setAudioEnabled,
  setAudioVolume,
  setMusicEnabled,
  shutdownAudio,
  stopAudioEvents,
} from './audioEvents'
import {
  countInversions,
  createBubbleSortSteps,
  INITIAL_ORDER,
  isSorted,
  shuffleRobots,
  type BubbleStep,
  type RobotId,
} from './bubbleSortEngine'
import { CodePanel, VariablesPanel } from './components/CodePanel'
import {
  RobotStage,
  type RobotStageHandle,
  type SwapVariant,
} from './components/RobotStage'

type GameStatus = 'ready' | 'running' | 'paused' | 'complete'
type PlayMode = 'auto' | 'manual'
type ManualDirection = 'left' | 'right'
type FeedbackTone = 'neutral' | 'correct' | 'wrong'

interface ManualStats {
  moves: number
  correct: number
  wrong: number
}

interface ManualFeedback {
  tone: FeedbackTone
  text: string
}

const ROBOT_COLORS: Record<RobotId, string> = {
  1: '#35cfff',
  2: '#33ead2',
  3: '#58f45b',
  4: '#ffd13d',
  5: '#ff4fad',
  6: '#a66bff',
  7: '#ff43df',
}

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const
const EMPTY_MANUAL_STATS: ManualStats = { moves: 0, correct: 0, wrong: 0 }
const MOBILE_LAYOUT_QUERY = '(orientation: portrait), (max-width: 768px)'

function IconButton({
  icon,
  label,
  className = '',
  disabled = false,
  onClick,
}: {
  icon: string
  label: string
  className?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`control-button ${className}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <span className="button-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail: string
}) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function App() {
  const [order, setOrder] = useState<RobotId[]>(INITIAL_ORDER)
  const [currentStep, setCurrentStep] = useState<BubbleStep | null>(null)
  const [status, setStatus] = useState<GameStatus>('ready')
  const [playMode, setPlayMode] = useState<PlayMode>('auto')
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [musicEnabled, setMusicEnabledState] = useState(false)
  const [audioVolume, setAudioVolumeState] = useState(0.65)
  const [reelMode, setReelMode] = useState(() =>
    window.matchMedia(MOBILE_LAYOUT_QUERY).matches,
  )
  const [isBusy, setIsBusy] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [selectedRobot, setSelectedRobot] = useState<RobotId | null>(null)
  const [manualStats, setManualStats] = useState<ManualStats>(EMPTY_MANUAL_STATS)
  const [manualLastMove, setManualLastMove] = useState('هنوز حرکتی انجام نشده')
  const [manualFeedback, setManualFeedback] = useState<ManualFeedback>({
    tone: 'neutral',
    text: 'یک ربات را انتخاب کن؛ کلیدهای ۱ تا ۷ هم کار می‌کنند.',
  })

  const stageRef = useRef<RobotStageHandle>(null)
  const seedOrderRef = useRef<RobotId[]>(INITIAL_ORDER)
  const orderRef = useRef<RobotId[]>(INITIAL_ORDER)
  const stepsRef = useRef(createBubbleSortSteps(INITIAL_ORDER))
  const cursorRef = useRef(0)
  const speedRef = useRef(speed)
  const pausedRef = useRef(false)
  const autoRunRef = useRef(false)
  const loopActiveRef = useRef(false)
  const runTokenRef = useRef(0)
  const playModeRef = useRef<PlayMode>('auto')
  const soundEnabledRef = useRef(false)
  const selectedRobotRef = useRef<RobotId | null>(null)
  const manualStatsRef = useRef<ManualStats>(EMPTY_MANUAL_STATS)
  const manualBusyRef = useRef(false)
  const swapCounterRef = useRef(0)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  useEffect(() => {
    setAudioVolume(audioVolume)
  }, [audioVolume])

  useEffect(() => {
    const portraitLayout = window.matchMedia(MOBILE_LAYOUT_QUERY)
    const syncLayout = () => setReelMode(portraitLayout.matches)
    portraitLayout.addEventListener('change', syncLayout)
    return () => portraitLayout.removeEventListener('change', syncLayout)
  }, [])

  useEffect(
    () => () => {
      runTokenRef.current += 1
      stageRef.current?.cancelAnimations()
      shutdownAudio()
    },
    [],
  )

  const waitFor = useCallback(
    (duration: number, token: number, pauseAware = true) =>
      new Promise<boolean>((resolve) => {
        let elapsed = 0
        let lastTime = performance.now()

        const tick = (time: number) => {
          if (token !== runTokenRef.current) {
            resolve(false)
            return
          }

          if (!pauseAware || !pausedRef.current) elapsed += time - lastTime
          lastTime = time

          if (elapsed >= duration) {
            resolve(true)
            return
          }

          requestAnimationFrame(tick)
        }

        requestAnimationFrame(tick)
      }),
    [],
  )

  const waitUntilResumed = useCallback(
    (token: number) =>
      new Promise<boolean>((resolve) => {
        const tick = () => {
          if (token !== runTokenRef.current || !autoRunRef.current) {
            resolve(false)
            return
          }

          if (!pausedRef.current) {
            resolve(true)
            return
          }

          requestAnimationFrame(tick)
        }

        requestAnimationFrame(tick)
      }),
    [],
  )

  const getNextSwapVariant = () => {
    const variant = (swapCounterRef.current % 4) as SwapVariant
    swapCounterRef.current += 1
    return variant
  }

  const executeStep = useCallback(
    async (step: BubbleStep, token: number) => {
      setIsBusy(true)
      setCurrentStep(step)

      if (step.kind === 'compare') {
        emitAudioEvent('compare', soundEnabledRef.current)
        const completed = await waitFor(620 / speedRef.current, token)
        setIsBusy(false)
        return completed
      }

      if (step.kind === 'swap') {
        const variant = getNextSwapVariant()
        emitAudioEvent('prepare', soundEnabledRef.current)
        emitAudioEvent('swap', soundEnabledRef.current)
        emitAudioEvent('jump', soundEnabledRef.current)
        if (variant === 1 || variant === 3) {
          emitAudioEvent('flip', soundEnabledRef.current)
        }

        const animated = await stageRef.current?.animateSwap(
          step.leftIndex,
          940 / speedRef.current,
          variant,
        )

        if (!animated || token !== runTokenRef.current) {
          setIsBusy(false)
          return false
        }

        flushSync(() => setOrder(step.arrayAfter))
        orderRef.current = [...step.arrayAfter]
        stageRef.current?.settleAnimations()
        emitAudioEvent('land', soundEnabledRef.current)
        const completed = await waitFor(160 / speedRef.current, token)
        setIsBusy(false)
        return completed
      }

      if (step.kind === 'pass-complete') {
        emitAudioEvent('passComplete', soundEnabledRef.current)
        const completed = await waitFor(420 / speedRef.current, token)
        setIsBusy(false)
        return completed
      }

      flushSync(() => setOrder(step.arrayAfter))
      orderRef.current = [...step.arrayAfter]
      setCelebrating(true)
      setStatus('complete')
      pauseBackgroundMusic()
      emitAudioEvent('success', soundEnabledRef.current)
      setIsBusy(false)
      return true
    },
    [waitFor],
  )

  const runAutomatically = useCallback(async () => {
    if (loopActiveRef.current || playModeRef.current !== 'auto') return

    const token = runTokenRef.current
    loopActiveRef.current = true
    autoRunRef.current = true
    pausedRef.current = false
    setStatus('running')

    try {
      while (
        autoRunRef.current &&
        playModeRef.current === 'auto' &&
        token === runTokenRef.current &&
        cursorRef.current < stepsRef.current.length
      ) {
        if (pausedRef.current) {
          const resumed = await waitUntilResumed(token)
          if (!resumed || !autoRunRef.current) break
        }

        const step = stepsRef.current[cursorRef.current]
        const completed = await executeStep(step, token)
        if (!completed) break
        cursorRef.current += 1

        if (step.kind === 'complete') {
          autoRunRef.current = false
          break
        }
      }
    } finally {
      loopActiveRef.current = false
    }
  }, [executeStep, waitUntilResumed])

  const configureGame = useCallback((nextOrder: RobotId[], updateSeed: boolean) => {
    runTokenRef.current += 1
    autoRunRef.current = false
    pausedRef.current = false
    loopActiveRef.current = false
    manualBusyRef.current = false
    stageRef.current?.cancelAnimations()
    stopAudioEvents()

    const nextSteps = createBubbleSortSteps(nextOrder)
    if (updateSeed) seedOrderRef.current = [...nextOrder]
    orderRef.current = [...nextOrder]
    stepsRef.current = nextSteps
    cursorRef.current = 0
    swapCounterRef.current = 0
    selectedRobotRef.current = null
    manualStatsRef.current = EMPTY_MANUAL_STATS

    setOrder([...nextOrder])
    setCurrentStep(null)
    setStatus('ready')
    setIsBusy(false)
    setCelebrating(false)
    setSelectedRobot(null)
    setManualStats(EMPTY_MANUAL_STATS)
    setManualLastMove('هنوز حرکتی انجام نشده')
    setManualFeedback({
      tone: 'neutral',
      text: 'یک ربات را انتخاب کن؛ کلیدهای ۱ تا ۷ هم کار می‌کنند.',
    })
  }, [])

  const switchMode = useCallback(
    (nextMode: PlayMode) => {
      if (nextMode === playModeRef.current) return
      playModeRef.current = nextMode
      setPlayMode(nextMode)
      configureGame([...seedOrderRef.current], false)
    },
    [configureGame],
  )

  const pauseGame = () => {
    if (playMode !== 'auto' || status !== 'running') return
    pausedRef.current = true
    stageRef.current?.pauseAnimations()
    pauseBackgroundMusic()
    setStatus('paused')
  }

  const resumeGame = () => {
    if (playMode !== 'auto' || status === 'complete') return
    pausedRef.current = false
    autoRunRef.current = true
    stageRef.current?.resumeAnimations()
    resumeBackgroundMusic()
    setStatus('running')
    void runAutomatically()
  }

  const stepOnce = async () => {
    if (playMode !== 'auto' || isBusy || status === 'complete') return

    autoRunRef.current = false
    pausedRef.current = false
    stageRef.current?.resumeAnimations()
    resumeBackgroundMusic()

    while (loopActiveRef.current) {
      await waitFor(16, runTokenRef.current, false)
    }

    const step = stepsRef.current[cursorRef.current]
    if (!step) return
    const token = runTokenRef.current
    const completed = await executeStep(step, token)
    if (!completed) return

    cursorRef.current += 1
    if (step.kind !== 'complete') {
      pausedRef.current = true
      pauseBackgroundMusic()
      setStatus('paused')
    }
  }

  const selectRobot = useCallback((robot: RobotId) => {
    if (playModeRef.current !== 'manual' || manualBusyRef.current) return
    selectedRobotRef.current = robot
    setSelectedRobot(robot)
    setManualFeedback({
      tone: 'neutral',
      text: `ربات ${robot} انتخاب شد؛ حالا جهت حرکت را بزن.`,
    })
  }, [])

  const moveSelectedRobot = useCallback(
    async (direction: ManualDirection) => {
      if (
        playModeRef.current !== 'manual' ||
        manualBusyRef.current ||
        status === 'complete'
      ) {
        return
      }

      const robot = selectedRobotRef.current
      if (!robot) {
        setManualFeedback({ tone: 'neutral', text: 'اول یک ربات را انتخاب کن.' })
        return
      }

      const before = [...orderRef.current]
      const currentIndex = before.indexOf(robot)
      const targetIndex = currentIndex + (direction === 'left' ? -1 : 1)

      if (targetIndex < 0 || targetIndex >= before.length) {
        setManualFeedback({
          tone: 'neutral',
          text: direction === 'left' ? 'این ربات در لبهٔ چپ است.' : 'این ربات در لبهٔ راست است.',
        })
        setManualLastMove(`حرکت ربات ${robot} به لبه مجاز نبود`)
        return
      }

      const next = [...before]
      next[currentIndex] = next[targetIndex]
      next[targetIndex] = robot
      const beforeInversions = countInversions(before)
      const afterInversions = countInversions(next)
      const improved = afterInversions < beforeInversions
      const token = runTokenRef.current
      const variant = getNextSwapVariant()

      manualBusyRef.current = true
      setIsBusy(true)
      setManualFeedback({ tone: 'neutral', text: `ربات ${robot} در حال حرکت است…` })
      emitAudioEvent('prepare', soundEnabledRef.current)
      emitAudioEvent('swap', soundEnabledRef.current)
      emitAudioEvent('jump', soundEnabledRef.current)
      if (variant === 1 || variant === 3) emitAudioEvent('flip', soundEnabledRef.current)

      const animated = await stageRef.current?.animateSwap(
        Math.min(currentIndex, targetIndex),
        860 / speedRef.current,
        variant,
      )

      if (
        !animated ||
        token !== runTokenRef.current ||
        playModeRef.current !== 'manual'
      ) {
        if (token === runTokenRef.current) {
          manualBusyRef.current = false
          setIsBusy(false)
        }
        return
      }

      flushSync(() => setOrder(next))
      orderRef.current = next
      stageRef.current?.settleAnimations()
      emitAudioEvent('land', soundEnabledRef.current)

      const previousStats = manualStatsRef.current
      const nextStats = {
        moves: previousStats.moves + 1,
        correct: previousStats.correct + (improved ? 1 : 0),
        wrong: previousStats.wrong + (improved ? 0 : 1),
      }
      manualStatsRef.current = nextStats
      setManualStats(nextStats)
      setManualLastMove(
        `ربات ${robot}: خانه ${currentIndex} ${direction === 'left' ? '←' : '→'} ${targetIndex} | وارونگی ${beforeInversions} → ${afterInversions}`,
      )

      if (improved) {
        emitAudioEvent('correctAnswer', soundEnabledRef.current)
        setManualFeedback({
          tone: 'correct',
          text: 'عالی بود؛ ترتیب بهتر شد! ✨',
        })
      } else {
        emitAudioEvent('wrongAnswer', soundEnabledRef.current)
        setManualFeedback({
          tone: 'wrong',
          text: 'این حرکت ترتیب رو بدتر کرد! 😅',
        })
      }

      if (isSorted(next)) {
        setCelebrating(true)
        setStatus('complete')
        pauseBackgroundMusic()
        emitAudioEvent('success', soundEnabledRef.current)
      }

      await waitFor(120 / speedRef.current, token, false)
      if (token === runTokenRef.current) {
        manualBusyRef.current = false
        setIsBusy(false)
      }
    },
    [status, waitFor],
  )

  useEffect(() => {
    if (playMode !== 'manual') return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (/^[1-7]$/.test(event.key)) {
        event.preventDefault()
        if (!event.repeat) selectRobot(Number(event.key) as RobotId)
        return
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (event.repeat) return
        void moveSelectedRobot(event.key === 'ArrowLeft' ? 'left' : 'right')
      }
    }

    window.addEventListener('keydown', handleKeyDown, { passive: false })
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [moveSelectedRobot, playMode, selectRobot])

  const toggleSound = () => {
    const next = !soundEnabled
    soundEnabledRef.current = next
    setSoundEnabled(next)
    setAudioEnabled(next)
    if (!next) {
      setMusicEnabled(false)
      setMusicEnabledState(false)
    }
  }

  const toggleMusic = () => {
    const next = !musicEnabled
    if (next && !soundEnabled) {
      soundEnabledRef.current = true
      setSoundEnabled(true)
      setAudioEnabled(true)
    }
    setMusicEnabledState(next)
    setMusicEnabled(next)
  }

  const activePass = currentStep?.pass ?? 0
  const selectedIndex = selectedRobot ? order.indexOf(selectedRobot) : -1
  const pairText = useMemo(() => {
    if (!currentStep) return 'برای شروع آماده‌ایم'
    if (currentStep.kind === 'complete') return 'مرتب‌سازی کامل شد'
    if (currentStep.kind === 'pass-complete') return `دور ${activePass + 1} کامل شد`
    if (currentStep.kind === 'swap') {
      return `${currentStep.leftValue} > ${currentStep.rightValue} ، جابه‌جایی`
    }
    return currentStep.willSwap
      ? `${currentStep.leftValue} > ${currentStep.rightValue} ، باید جابه‌جا شوند`
      : `${currentStep.leftValue} < ${currentStep.rightValue} ، جای درست است`
  }, [activePass, currentStep])

  const canMoveLeft = selectedIndex > 0 && !isBusy && status !== 'complete'
  const canMoveRight =
    selectedIndex >= 0 && selectedIndex < order.length - 1 && !isBusy && status !== 'complete'

  const manualCodeState =
    playMode === 'manual'
      ? {
          selectedRobot,
          selectedIndex,
          lastMove: manualLastMove,
          moves: manualStats.moves,
          correct: manualStats.correct,
          wrong: manualStats.wrong,
        }
      : undefined

  return (
    <main className={`app-shell ${reelMode ? 'reel-mode' : ''} mode-${playMode}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="game-layout">
        <div className="play-column">
          <RobotStage
            ref={stageRef}
            order={order}
            currentStep={playMode === 'auto' ? currentStep : null}
            celebrating={celebrating}
            mode={playMode}
            selectedRobot={selectedRobot}
            onSelectRobot={selectRobot}
          />

          <section className="data-deck" aria-label="وضعیت الگوریتم">
            <div className="array-card">
              <div className="card-label">
                <span>آرایه فعلی</span>
                <small>Current array</small>
              </div>
              <div className="array-values" dir="ltr">
                <b>[</b>
                {order.map((robot, index) => (
                  <span
                    key={robot}
                    className={
                      (playMode === 'manual' && robot === selectedRobot) ||
                      (playMode === 'auto' &&
                        currentStep &&
                        (index === currentStep.leftIndex || index === currentStep.rightIndex) &&
                        (currentStep.kind === 'compare' || currentStep.kind === 'swap'))
                        ? 'is-selected'
                        : ''
                    }
                    style={{ '--chip-color': ROBOT_COLORS[robot] } as CSSProperties}
                  >
                    {robot}
                  </span>
                ))}
                <b>]</b>
              </div>
            </div>

            {playMode === 'manual' ? (
              <div className={`comparison-card manual-card feedback-${manualFeedback.tone}`}>
                <div className="comparison-icon" aria-hidden="true">
                  🎮
                </div>
                <div className="manual-feedback">
                  <span>بازی دستی آزاد</span>
                  <strong>{manualFeedback.text}</strong>
                  <small>{manualLastMove}</small>
                </div>
                <div className="manual-arrows" dir="ltr">
                  <button
                    type="button"
                    onClick={() => void moveSelectedRobot('left')}
                    disabled={!canMoveLeft}
                    aria-label="جابه‌جایی ربات انتخاب‌شده به چپ"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveSelectedRobot('right')}
                    disabled={!canMoveRight}
                    aria-label="جابه‌جایی ربات انتخاب‌شده به راست"
                  >
                    →
                  </button>
                </div>
              </div>
            ) : (
              <div className="comparison-card">
                <div className="comparison-icon" aria-hidden="true">
                  ↔
                </div>
                <div>
                  <span>مقایسه فعلی</span>
                  <strong>{pairText}</strong>
                </div>
                <div className="index-pair" dir="ltr">
                  <span>i = {currentStep?.leftIndex ?? 0}</span>
                  <span>i+1 = {currentStep?.rightIndex ?? 1}</span>
                </div>
              </div>
            )}

            {playMode === 'manual' ? (
              <div className="pass-track manual-stats">
                <div>
                  <span>آمار بازی</span>
                  <b>{manualStats.moves} حرکت</b>
                </div>
                <div className="manual-stat-row">
                  <span>درست <b>{manualStats.correct}</b></span>
                  <span>اشتباه <b>{manualStats.wrong}</b></span>
                  <span>انتخاب <b>{selectedRobot ?? '-'}</b></span>
                  <span>خانه <b>{selectedIndex >= 0 ? selectedIndex : '-'}</b></span>
                </div>
              </div>
            ) : (
              <div className="pass-track">
                <div>
                  <span>پیشرفت دورها</span>
                  <b>Pass {Math.min(activePass + 1, 6)} / 6</b>
                </div>
                <div className="pass-dots" aria-label={`دور ${activePass + 1} از 6`}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <i
                      className={
                        status === 'complete' || index < activePass
                          ? 'is-done'
                          : index === activePass
                            ? 'is-current'
                            : ''
                      }
                      key={index}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="side-column">
          <CodePanel
            currentStep={playMode === 'auto' ? currentStep : null}
            order={order}
            manualState={manualCodeState}
            showVariables={!reelMode}
          />
          <section className="stats-grid desktop-only" aria-label="خلاصه الگوریتم">
            <StatCard
              label={playMode === 'manual' ? 'حالت' : 'عملیات'}
              value={
                playMode === 'manual'
                  ? 'FREE PLAY'
                  : currentStep?.kind === 'swap'
                    ? 'SWAP'
                    : 'CHECK'
              }
              detail={playMode === 'manual' ? 'حرکت آزاد' : 'مرحله جاری'}
            />
            <StatCard
              label="اندیس"
              value={
                playMode === 'manual'
                  ? selectedIndex >= 0
                    ? selectedIndex
                    : '-'
                  : `${currentStep?.leftIndex ?? 0}:${currentStep?.rightIndex ?? 1}`
              }
              detail={playMode === 'manual' ? 'ربات انتخابی' : 'جفت مجاور'}
            />
            <StatCard
              label="ترتیب"
              value={isSorted(order) ? 'ASC' : 'MIX'}
              detail={`${countInversions(order)} وارونگی`}
            />
          </section>
        </div>
      </div>

      <section className="control-dock" aria-label="کنترل‌های بازی">
        <div className="mode-switch" role="group" aria-label="انتخاب حالت بازی">
          <button
            type="button"
            className={playMode === 'auto' ? 'is-active' : ''}
            onClick={() => switchMode('auto')}
            aria-pressed={playMode === 'auto'}
          >
            <span aria-hidden="true">▶</span>
            نمایش خودکار
          </button>
          <button
            type="button"
            className={playMode === 'manual' ? 'is-active' : ''}
            onClick={() => switchMode('manual')}
            aria-pressed={playMode === 'manual'}
          >
            <span aria-hidden="true">🎮</span>
            بازی دستی
          </button>
        </div>

        <div className={`primary-controls controls-${playMode}`}>
          {playMode === 'auto' ? (
            <>
              <IconButton
                icon="▶"
                label={status === 'paused' ? 'ادامه' : 'شروع'}
                className="start-button"
                disabled={status === 'running' || status === 'complete'}
                onClick={resumeGame}
              />
              <IconButton
                icon="Ⅱ"
                label="توقف"
                disabled={status !== 'running'}
                onClick={pauseGame}
              />
              <IconButton
                icon="▷|"
                label="مرحله بعد"
                disabled={isBusy || status === 'running' || status === 'complete'}
                onClick={() => void stepOnce()}
              />
              <IconButton
                icon="↻"
                label="اجرای مجدد"
                onClick={() => configureGame([...seedOrderRef.current], false)}
              />
              <IconButton
                icon="⇄"
                label="تصادفی"
                className="desktop-only"
                onClick={() => configureGame(shuffleRobots(), true)}
              />
              <IconButton
                icon={soundEnabled ? '◕' : '◯'}
                label={soundEnabled ? 'صدا روشن' : 'صدا خاموش'}
                className="sound-button"
                onClick={toggleSound}
              />
            </>
          ) : (
            <>
              <IconButton
                icon="←"
                label="حرکت به چپ"
                className="manual-move-button"
                disabled={!canMoveLeft}
                onClick={() => void moveSelectedRobot('left')}
              />
              <IconButton
                icon="→"
                label="حرکت به راست"
                className="manual-move-button"
                disabled={!canMoveRight}
                onClick={() => void moveSelectedRobot('right')}
              />
              <IconButton
                icon="↻"
                label="اجرای مجدد"
                onClick={() => configureGame([...seedOrderRef.current], false)}
              />
              <IconButton
                icon="⇄"
                label="تصادفی"
                className="desktop-only"
                onClick={() => configureGame(shuffleRobots(), true)}
              />
              <IconButton
                icon={soundEnabled ? '◕' : '◯'}
                label={soundEnabled ? 'صدا روشن' : 'صدا خاموش'}
                className="sound-button"
                onClick={toggleSound}
              />
            </>
          )}
        </div>

        <div className="speed-control">
          <div>
            <span>سرعت</span>
            <b>{speed}x</b>
          </div>
          <div className="speed-options" dir="ltr">
            {SPEED_OPTIONS.map((option) => (
              <button
                type="button"
                className={speed === option ? 'is-active' : ''}
                key={option}
                onClick={() => setSpeed(option)}
                aria-label={`سرعت ${option} برابر`}
              >
                {option}x
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="reel-audio-settings reel-only" aria-label="تنظیمات صدا">
        <button
          type="button"
          className={musicEnabled ? 'is-active' : ''}
          onClick={toggleMusic}
          aria-pressed={musicEnabled}
        >
          <span aria-hidden="true">♫</span>
          {musicEnabled ? 'موسیقی روشن' : 'موسیقی خاموش'}
        </button>
        <label>
          <span>شدت صدا</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audioVolume}
            onChange={(event) => setAudioVolumeState(Number(event.target.value))}
            aria-label="شدت صدا"
          />
          <b>{Math.round(audioVolume * 100)}%</b>
        </label>
      </section>

      <VariablesPanel
        className="reel-variables-panel reel-only"
        currentStep={playMode === 'auto' ? currentStep : null}
        order={order}
        manualState={manualCodeState}
      />

      {celebrating && (
        <section className="success-overlay" role="status" aria-live="polite">
          <div className="success-orbit" aria-hidden="true">
            <span>✓</span>
          </div>
          <p>ماموریت انجام شد</p>
          <h2>
            Sorted! <span>مرتب شد!</span>
          </h2>
          <div className="final-array" dir="ltr">
            [1, 2, 3, 4, 5, 6, 7]
          </div>
          {playMode === 'manual' && (
            <div className="manual-result">با {manualStats.moves} حرکت</div>
          )}
          <button
            type="button"
            onClick={() => configureGame([...seedOrderRef.current], false)}
          >
            <span aria-hidden="true">↻</span>
            دوباره بازی کن
          </button>
        </section>
      )}
    </main>
  )
}

export default App
