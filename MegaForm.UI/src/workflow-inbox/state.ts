import type { WorkflowInboxState } from './types';

export function createWorkflowInboxState(initialTaskId: string): WorkflowInboxState {
  return {
    inbox: null,
    selectedTaskId: initialTaskId || '',
    selectedTaskDetail: null,
    selectedSubmissionDetail: null,
    busy: false,
    error: '',
  };
}
