export const ROBOT_IDS = [1, 2, 3, 4, 5, 6, 7] as const

export type RobotId = (typeof ROBOT_IDS)[number]
export type StepKind = 'compare' | 'swap' | 'pass-complete' | 'complete'

export interface BubbleStep {
  id: string
  kind: StepKind
  pass: number
  leftIndex: number
  rightIndex: number
  leftValue: RobotId
  rightValue: RobotId
  arrayBefore: RobotId[]
  arrayAfter: RobotId[]
  codeLine: number | null
  willSwap: boolean
  swappedInPass: boolean
}

export const INITIAL_ORDER: RobotId[] = [4, 1, 7, 3, 6, 2, 5]

function assertRobotOrder(input: readonly RobotId[]) {
  const sorted = [...input].sort((a, b) => a - b)

  if (
    sorted.length !== ROBOT_IDS.length ||
    sorted.some((value, index) => value !== ROBOT_IDS[index])
  ) {
    throw new Error('Robot order must contain the numbers 1 through 7 once.')
  }
}

export function createBubbleSortSteps(input: readonly RobotId[]): BubbleStep[] {
  assertRobotOrder(input)

  const array = [...input]
  const steps: BubbleStep[] = []
  let sequence = 0
  let finalPass = 0

  const addStep = (step: Omit<BubbleStep, 'id'>) => {
    sequence += 1
    steps.push({ ...step, id: `${step.kind}-${step.pass}-${sequence}` })
  }

  for (let pass = 0; pass < array.length - 1; pass += 1) {
    let swappedInPass = false
    let lastLeftIndex = 0
    finalPass = pass

    for (let index = 0; index < array.length - 1 - pass; index += 1) {
      const leftValue = array[index]
      const rightValue = array[index + 1]
      const willSwap = leftValue > rightValue
      const before = [...array]
      lastLeftIndex = index

      addStep({
        kind: 'compare',
        pass,
        leftIndex: index,
        rightIndex: index + 1,
        leftValue,
        rightValue,
        arrayBefore: before,
        arrayAfter: before,
        codeLine: 6,
        willSwap,
        swappedInPass,
      })

      if (willSwap) {
        array[index] = rightValue
        array[index + 1] = leftValue
        swappedInPass = true

        addStep({
          kind: 'swap',
          pass,
          leftIndex: index,
          rightIndex: index + 1,
          leftValue,
          rightValue,
          arrayBefore: before,
          arrayAfter: [...array],
          codeLine: 7,
          willSwap: true,
          swappedInPass,
        })
      }
    }

    const passSnapshot = [...array]
    addStep({
      kind: 'pass-complete',
      pass,
      leftIndex: lastLeftIndex,
      rightIndex: lastLeftIndex + 1,
      leftValue: passSnapshot[lastLeftIndex],
      rightValue: passSnapshot[lastLeftIndex + 1],
      arrayBefore: passSnapshot,
      arrayAfter: passSnapshot,
      codeLine: 9,
      willSwap: false,
      swappedInPass,
    })

    if (!swappedInPass) break
  }

  const lastLeftIndex = Math.max(0, array.length - 2 - finalPass)
  addStep({
    kind: 'complete',
    pass: finalPass,
    leftIndex: lastLeftIndex,
    rightIndex: lastLeftIndex + 1,
    leftValue: array[lastLeftIndex],
    rightValue: array[lastLeftIndex + 1],
    arrayBefore: [...array],
    arrayAfter: [...array],
    codeLine: null,
    willSwap: false,
    swappedInPass: false,
  })

  return steps
}

export function isSorted(order: readonly RobotId[]) {
  return order.every((value, index) => index === 0 || order[index - 1] < value)
}

export function countInversions(order: readonly RobotId[]) {
  let inversions = 0

  for (let left = 0; left < order.length; left += 1) {
    for (let right = left + 1; right < order.length; right += 1) {
      if (order[left] > order[right]) inversions += 1
    }
  }

  return inversions
}

export function shuffleRobots(random = Math.random): RobotId[] {
  const shuffled = [...ROBOT_IDS]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = current
  }

  return shuffled
}
