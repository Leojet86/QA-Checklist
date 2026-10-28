import type { TestCase } from '@/models/checklists/TestCase'

export interface Checklist {
  id: string
  parentId: string
  title: string
  description: string
  testCases: TestCase[]
  createdAt: string
  updatedAt: string
}
