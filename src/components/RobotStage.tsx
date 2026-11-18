import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { BubbleStep, RobotId } from '../bubbleSortEngine'

const ROBOT_COLORS: Record<RobotId, string> = {
  1: '#35cfff',
  2: '#33ead2',
  3: '#58f45b',
  4: '#ffd13d',
  5: '#ff4fad',
  6: '#a66bff',
  7: '#ff43df',
}

const CONFETTI = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  x: `${4 + ((index * 37) % 92)}%`,
  delay: `${(index % 10) * 0.08}s`,
  duration: `${1.7 + (index % 5) * 0.16}s`,
  rotation: `${90 + ((index * 47) % 260)}deg`,
  color: ['#35cfff', '#33ead2', '#ffd13d', '#ff4fad', '#a66bff'][index % 5],
}))

type RobotStyle = CSSProperties & {
  '--slot': number
  '--robot-color': string
  '--robot-delay': string
  '--robot-height': string
}

type ConfettiStyle = CSSProperties & {
  '--x': string
  '--confetti-delay': string
  '--confetti-duration': string
  '--confetti-rotation': string
  '--confetti-color': string
}

export type SwapVariant = 0 | 1 | 2 | 3

export interface RobotStageHandle {
  animateSwap: (
    leftIndex: number,
    duration: number,
    variant?: SwapVariant,
  ) => Promise<boolean>
  pauseAnimations: () => void
  resumeAnimations: () => void
  settleAnimations: () => void
  cancelAnimations: () => void
}

interface RobotStageProps {
  order: RobotId[]
  currentStep: BubbleStep | null
  celebrating: boolean
  mode: 'auto' | 'manual'
  selectedRobot: RobotId | null
  onSelectRobot: (robot: RobotId) => void
}

function swapKeyframes(
  travel: number,
  variant: SwapVariant,
  side: 'left' | 'right',
): Keyframe[] {
  const sign = side === 'left' ? 1 : -1
  const end = `translate3d(${travel}px, 0, 0)`

  if (variant === 1) {
    return [
      { transform: 'translate3d(0, 0, 0) rotate(0) scale(1)' },
      { offset: 0.12, transform: 'translate3d(0, 5px, 0) rotate(0) scale(1.04, .95)' },
      { offset: 0.44, transform: `translate3d(${travel * 0.46}px, -66px, 0) rotate(${sign * 185}deg) scale(1.07)` },
      { offset: 0.74, transform: `translate3d(${travel * 0.82}px, -28px, 0) rotate(${sign * 326}deg) scale(1.03)` },
      { offset: 0.9, transform: `${end} rotate(${sign * 360}deg) scale(1.06, .94)` },
      { transform: `${end} rotate(${sign * 360}deg) scale(1)` },
    ]
  }

  if (variant === 2) {
    return [
      { transform: 'translate3d(0, 0, 0) rotate(0) scale(1)' },
      { offset: 0.14, transform: `translate3d(${travel * 0.08}px, -14px, 0) rotate(${sign * -5}deg) scale(1.03)` },
      { offset: 0.35, transform: `translate3d(${travel * 0.34}px, -58px, 0) rotate(${sign * 8}deg) scale(1.05)` },
      { offset: 0.57, transform: `translate3d(${travel * 0.55}px, -34px, 0) rotate(${sign * -8}deg) scale(1.04)` },
      { offset: 0.76, transform: `translate3d(${travel * 0.82}px, -47px, 0) rotate(${sign * 5}deg) scale(1.03)` },
      { offset: 0.92, transform: `${end} rotate(0) scale(1.07, .93)` },
      { transform: `${end} rotate(0) scale(1)` },
    ]
  }

  if (variant === 3) {
    const flips = side === 'left'
    return [
      { transform: 'translate3d(0, 0, 0) rotateY(0) rotate(0) scale(1)' },
      { offset: 0.13, transform: 'translate3d(0, 5px, 0) rotateY(0) scale(1.04, .95)' },
      {
        offset: 0.5,
        transform: `translate3d(${travel * 0.54}px, ${flips ? -88 : -55}px, 0) rotateY(${flips ? 205 : 0}deg) rotate(${sign * 6}deg) scale(1.07)`,
      },
      {
        offset: 0.78,
        transform: `translate3d(${travel * 0.86}px, -24px, 0) rotateY(${flips ? 332 : 0}deg) rotate(${sign * -3}deg) scale(1.03)`,
      },
      { offset: 0.92, transform: `${end} rotateY(${flips ? 360 : 0}deg) scale(1.08, .92)` },
      { transform: `${end} rotateY(${flips ? 360 : 0}deg) scale(1)` },
    ]
  }

  return [
    { transform: 'translate3d(0, 0, 0) rotate(0) scale(1)' },
    { offset: 0.13, transform: 'translate3d(0, 5px, 0) rotate(0) scale(1.04, .95)' },
    { offset: 0.48, transform: `translate3d(${travel * 0.52}px, -82px, 0) rotate(${sign * 8}deg) scale(1.07)` },
    { offset: 0.76, transform: `translate3d(${travel * 0.86}px, -30px, 0) rotate(${sign * -3}deg) scale(1.03)` },
    { offset: 0.92, transform: `${end} rotate(0) scale(1.08, .92)` },
    { transform: `${end} rotate(0) scale(1)` },
  ]
}

export const RobotStage = forwardRef<RobotStageHandle, RobotStageProps>(
  function RobotStage(
    { order, currentStep, celebrating, mode, selectedRobot, onSelectRobot },
    ref,
  ) {
    const trackRef = useRef<HTMLDivElement>(null)
    const animationsRef = useRef<Set<Animation>>(new Set())

    const cancelAnimations = () => {
      animationsRef.current.forEach((animation) => animation.cancel())
      animationsRef.current.clear()
    }

    useEffect(() => cancelAnimations, [])

    useImperativeHandle(ref, () => ({
      async animateSwap(leftIndex, duration, variant = 0) {
        const track = trackRef.current
        if (!track) return false

        const leftRobot = track.querySelector<HTMLElement>(`[data-slot="${leftIndex}"]`)
        const rightRobot = track.querySelector<HTMLElement>(`[data-slot="${leftIndex + 1}"]`)

        if (!leftRobot || !rightRobot) return false
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true

        const distance =
          rightRobot.getBoundingClientRect().left -
          leftRobot.getBoundingClientRect().left

        const createAnimation = (
          element: HTMLElement,
          travel: number,
          side: 'left' | 'right',
        ) => {
          const animation = element.animate(swapKeyframes(travel, variant, side), {
            duration,
            easing: 'cubic-bezier(.2,.78,.2,1)',
            fill: 'forwards',
          })
          animationsRef.current.add(animation)
          return animation
        }

        leftRobot.classList.add('is-airborne', 'is-front', 'has-trail')
        rightRobot.classList.add('is-airborne', 'has-trail')
        if (variant === 3) leftRobot.classList.add('is-flipping')

        const leftAnimation = createAnimation(leftRobot, distance, 'left')
        const rightAnimation = createAnimation(rightRobot, -distance, 'right')

        try {
          await Promise.all([leftAnimation.finished, rightAnimation.finished])
          return true
        } catch {
          return false
        } finally {
          leftRobot.classList.remove('is-airborne', 'is-front', 'has-trail', 'is-flipping')
          rightRobot.classList.remove('is-airborne', 'has-trail')
        }
      },
      pauseAnimations() {
        animationsRef.current.forEach((animation) => animation.pause())
      },
      resumeAnimations() {
        animationsRef.current.forEach((animation) => animation.play())
      },
      settleAnimations: cancelAnimations,
      cancelAnimations,
    }))

    const isPairActive = (index: number) =>
      mode === 'auto' &&
      currentStep !== null &&
      (currentStep.kind === 'compare' || currentStep.kind === 'swap') &&
      (index === currentStep.leftIndex || index === currentStep.rightIndex)

    const handleRobotKey = (event: KeyboardEvent<HTMLElement>, robot: RobotId) => {
      if (mode !== 'manual') return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelectRobot(robot)
      }
    }

    return (
      <section className="stage-panel" aria-label="صحنه ربات‌ها">
        <div className={`robot-arena ${celebrating ? 'is-celebrating' : ''}`}>
          <div className="arena-light arena-light-left" />
          <div className="arena-light arena-light-right" />

          {celebrating && (
            <div className="confetti-field" aria-hidden="true">
              {CONFETTI.map((piece) => (
                <i
                  key={piece.id}
                  style={
                    {
                      '--x': piece.x,
                      '--confetti-delay': piece.delay,
                      '--confetti-duration': piece.duration,
                      '--confetti-rotation': piece.rotation,
                      '--confetti-color': piece.color,
                    } as ConfettiStyle
                  }
                />
              ))}
            </div>
          )}

          <div className="robots-track" ref={trackRef}>
            {order.map((robot, index) => {
              const active = isPairActive(index)
              const swapping = currentStep?.kind === 'swap' && active
              const selected = mode === 'manual' && robot === selectedRobot
              const style: RobotStyle = {
                '--slot': index,
                '--robot-color': ROBOT_COLORS[robot],
                '--robot-delay': `${index * 70}ms`,
                '--robot-height': `${48 + (robot - 1) * 8}%`,
              }

              return (
                <article
                  className={`robot-slot ${active ? 'is-active' : ''} ${swapping ? 'is-swapping' : ''} ${currentStep?.kind === 'compare' && active ? 'is-checking' : ''} ${selected ? 'is-selected-robot' : ''} ${mode === 'manual' ? 'is-interactive' : ''}`}
                  data-slot={index}
                  data-robot={robot}
                  key={robot}
                  style={style}
                  aria-label={`ربات شماره ${robot} در ایندکس ${index}${selected ? '، انتخاب شده' : ''}`}
                  aria-pressed={mode === 'manual' ? selected : undefined}
                  role={mode === 'manual' ? 'button' : undefined}
                  tabIndex={mode === 'manual' ? 0 : -1}
                  onClick={() => mode === 'manual' && onSelectRobot(robot)}
                  onKeyDown={(event) => handleRobotKey(event, robot)}
                >
                  <div className="robot-glow" />
                  <div className="robot-float">
                    <img
                      className="robot-image"
                      src={`/images/stage/robot-${robot}.png`}
                      alt={`ربات شماره ${robot}`}
                      draggable="false"
                    />
                  </div>
                  <div className="robot-shadow" />
                  <strong className="robot-value">{robot}</strong>
                  <span className="robot-index">i:{index}</span>
                </article>
              )
            })}
          </div>

          <div className="stage-platform" aria-hidden="true">
            <span />
          </div>
        </div>
      </section>
    )
  },
)
