import type { ChecklistDocument } from '@/models/checklists/ChecklistDocument'

export function createChecklistDocument(): ChecklistDocument {
  return {
    schemaVersion: 1,
    parents: [{ id: 'parent-1', name: 'Opération' }],
    checklists: [
      {
        id: 'checklist-1',
        parentId: 'parent-1',
        title: 'Créer un dossier',
        description: 'Vérification des opérations courantes',
        createdAt: '2026-10-27T12:00:00.000Z',
        updatedAt: '2026-10-27T12:00:00.000Z',
        testCases: [
          {
            id: 'case-1',
            title: 'Enregistrer le dossier',
            description: 'Saisir les champs obligatoires et enregistrer.',
            expectedResults: ['Le dossier apparaît dans la liste.', 'Un numéro est attribué.'],
            status: 'passed',
          },
        ],
      },
    ],
  }
}
