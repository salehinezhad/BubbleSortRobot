import type { ReactNode } from 'react'
import type { BubbleStep, RobotId } from '../bubbleSortEngine'

export interface ManualCodeState {
  selectedRobot: RobotId | null
  selectedIndex: number
  lastMove: string
  moves: number
  correct: number
  wrong: number
}

interface CodePanelProps {
  currentStep: BubbleStep | null
  order: RobotId[]
  manualState?: ManualCodeState
  showVariables?: boolean
}

const codeLines: { number: number; content: ReactNode }[] = [
  {
    number: 1,
    content: (
      <>
        <span className="token-keyword">def</span>{' '}
        <span className="token-function">bubble_sort</span>(a):
      </>
    ),
  },
  {
    number: 2,
    content: (
      <>
        {'    '}n = <span className="token-function">len</span>(a)
      </>
    ),
  },
  {
    number: 3,
    content: (
      <>
        {'    '}<span className="token-keyword">for</span> p{' '}
        <span className="token-keyword">in</span>{' '}
        <span className="token-function">range</span>(n - 1):
      </>
    ),
  },
  {
    number: 4,
    content: (
      <>
        {'        '}swapped = <span className="token-literal">False</span>
      </>
    ),
  },
  {
    number: 5,
    content: (
      <>
        {'        '}<span className="token-keyword">for</span> i{' '}
        <span className="token-keyword">in</span>{' '}
        <span className="token-function">range</span>(n - 1 - p):
      </>
    ),
  },
  {
    number: 6,
    content: (
      <>
        {'            '}<span className="token-keyword">if</span> a[i] &gt; a[i + 1]:
      </>
    ),
  },
  { number: 7, content: '                a[i], a[i + 1] = a[i + 1], a[i]' },
  {
    number: 8,
    content: (
      <>
        {'                '}swapped = <span className="token-literal">True</span>
      </>
    ),
  },
  {
    number: 9,
    content: (
      <>
        {'        '}<span className="token-keyword">if not</span> swapped:
      </>
    ),
  },
  {
    number: 10,
    content: (
      <>
        {'            '}<span className="token-keyword">break</span>
      </>
    ),
  },
]

export function VariablesPanel({
  currentStep,
  order,
  manualState,
  className = '',
}: {
  currentStep: BubbleStep | null
  order: RobotId[]
  manualState?: ManualCodeState
  className?: string
}) {
  const currentIndex = currentStep?.leftIndex ?? 0
  const leftValue = currentStep?.leftValue ?? order[0]
  const rightValue = currentStep?.rightValue ?? order[1]
  const swapped = currentStep?.swappedInPass ?? false

  return (
    <section
      className={`variables-panel ${className}`.trim()}
      aria-label="متغیرهای مرحله فعلی"
    >
      <div className="variables-title">
        <span>{manualState ? 'وضعیت بازی دستی' : 'متغیرهای مرحله فعلی'}</span>
        <small>{manualState ? 'Manual state' : 'Current step'}</small>
      </div>
      {manualState ? (
        <div className="variables-grid manual-variables" dir="ltr">
          <span>
            selected <b>{manualState.selectedRobot ?? '-'}</b>
          </span>
          <span>
            index <b>{manualState.selectedIndex >= 0 ? manualState.selectedIndex : '-'}</b>
          </span>
          <span>
            moves <b>{manualState.moves}</b>
          </span>
          <span className="variable-true">
            correct <b>{manualState.correct}</b>
          </span>
          <span className={manualState.wrong ? 'variable-wrong' : ''}>
            wrong <b>{manualState.wrong}</b>
          </span>
          <span title={manualState.lastMove}>
            array <b>[{order.join(',')}]</b>
          </span>
        </div>
      ) : (
        <div className="variables-grid" dir="ltr">
          <span>
            n <b>7</b>
          </span>
          <span>
            p <b>{currentStep?.pass ?? 0}</b>
          </span>
          <span>
            i <b>{currentIndex}</b>
          </span>
          <span>
            a[i] <b>{leftValue}</b>
          </span>
          <span>
            a[i+1] <b>{rightValue}</b>
          </span>
          <span className={swapped ? 'variable-true' : ''}>
            swapped <b>{swapped ? 'True' : 'False'}</b>
          </span>
        </div>
      )}
    </section>
  )
}

export function CodePanel({
  currentStep,
  order,
  manualState,
  showVariables = true,
}: CodePanelProps) {
  const activeLine = manualState ? null : (currentStep?.codeLine ?? null)

  return (
    <aside className="code-panel" aria-label="کد پایتون Bubble Sort">
      <header className="code-header">
        <div className="window-controls" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="file-name">
          <span className="python-mark">Py</span>
          <b>bubble_sort.py</b>
        </div>
        <span className={`code-status ${manualState ? 'is-reference' : ''}`}>
          {manualState ? 'REFERENCE' : 'LIVE'}
        </span>
      </header>

      <div className="code-body" dir="ltr">
        {codeLines.map((line) => {
          const isActive = line.number === activeLine
          const lineState =
            isActive && currentStep?.kind === 'swap'
              ? 'swap-line'
              : isActive && currentStep?.kind === 'compare'
                ? 'compare-line'
                : isActive
                  ? 'pass-line'
                  : ''

          return (
            <div className={`code-line ${lineState}`} key={line.number}>
              <span className="line-number">{line.number}</span>
              <code>{line.content}</code>
            </div>
          )
        })}
      </div>

      {showVariables && (
        <VariablesPanel currentStep={currentStep} order={order} manualState={manualState} />
      )}
    </aside>
  )
}
