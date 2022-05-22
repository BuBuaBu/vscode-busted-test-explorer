import * as vscode from 'vscode'
import { ItemData } from './types'

const testDatas = new WeakMap<vscode.TestItem, ItemData>()
const tests = new Map<string, WeakRef<vscode.TestItem>>()

export function add (id: string, test: vscode.TestItem, data: ItemData) {
  testDatas.set(test, data)
  tests.set(id, new WeakRef(test))
}

export function getData (test: vscode.TestItem) {
  return testDatas.get(test)!
}

export function getTest (id: string): vscode.TestItem | undefined {
  const ref = tests.get(id)
  if (ref) {
    return ref.deref()
  }
}
