import type { TestCaseStatus } from '@/models/checklists/TestCaseStatus'

export interface TestCase {
  id: string
  title: string
  description: string
  expectedResults: string[]
  status: TestCaseStatus
}
