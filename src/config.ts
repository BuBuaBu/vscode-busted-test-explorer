import { workspace } from 'vscode'

export function getExecutable (): string {
  return workspace.getConfiguration('busted-test-explorer').get('executable') || 'busted'
}

export function getFilePattern (): string {
  return workspace.getConfiguration('busted-test-explorer').get('testfilepattern') || '*_spec.lua'
}

export function getArguments (): string[] {
  return workspace.getConfiguration('busted-test-explorer').get('args') || []
}

export function getWorkingDirectory (): string | undefined {
  return workspace.getConfiguration('busted-test-explorer').get('cwd')
}

export function getEnvironment (): { [id: string] : string } {
  return workspace.getConfiguration('busted-test-explorer').get('env') || {}
}
