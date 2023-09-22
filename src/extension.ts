import * as vscode from 'vscode'
import { parse } from './parser'
import * as minimatch from 'minimatch'
import * as config from './config'
import * as cache from './cache'
import * as runner from './runner'
import { ItemType, Test } from './types'
import { normalize } from 'path'

export function activate (context: vscode.ExtensionContext) {
  const controller = vscode.tests.createTestController('busted-test-explorer', 'Busted Test Explorer')
  context.subscriptions.push(controller)

  controller.resolveHandler = async test => {
    if (!test) {
      await discoverAllFilesInWorkspace()
    } else {
      await parseTestsInFileContents(test)
    }
  }

  vscode.workspace.onDidOpenTextDocument(parseTestsInDocument)
  vscode.workspace.onDidChangeTextDocument(e => parseTestsInDocument(e.document))

  function normalizePath (path: string) {
    return normalize(path).replace(/^\\/, '')
  }

  function getOrCreateFile (uri: vscode.Uri) {
    const existing = controller.items.get(uri.toString())
    if (existing) {
      return existing
    }

    const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri)
    file.canResolveChildren = true
    const id = normalizePath(uri.path)
    cache.add(id, file, { type: ItemType.file })
    controller.items.add(file)
    return file
  }

  function parseTestsInDocument (e: vscode.TextDocument) {
    if (e.uri.scheme === 'file' && minimatch(e.uri.fsPath, config.getFilePattern())) {
      console.log('[Busted] Parse:', e.uri.fsPath)
      parseTestsInFileContents(getOrCreateFile(e.uri), e.getText())
    }
  }

  function addTests (parent: vscode.TestItem, uri: vscode.Uri, filePath: String, baseName: String, definitions: Test[]) {
    const newIds = new Set()
    definitions.forEach((definition) => {
      const name = `${baseName}${baseName.length > 0 ? ' ' : ''}${definition.name}`
      const id = `${normalizePath(filePath as string)}:${name}`
      newIds.add(id)
      const test = controller.createTestItem(id, definition.name, uri)
      test.range = new vscode.Range(
        new vscode.Position(definition.loc.start.line - 1, definition.loc.start.column),
        new vscode.Position(definition.loc.end.line - 1, definition.loc.end.column))
      cache.add(id, test, {
        type: definition.type === 'Suite' ? ItemType.testSuite : ItemType.testCase,
        name
      })
      parent.children.add(test)

      if (definition.type === 'Suite') {
        addTests(test, uri, filePath, name, definition.child)
      }
    })
    parent.children.forEach((test) => {
      if (!newIds.has(test.id)) {
        parent.children.delete(test.id)
      }
    })
  }

  async function parseTestsInFileContents (file: vscode.TestItem, contents?: string) {
    if (!file.uri) {
      return
    }

    if (!contents) {
      contents = (await vscode.workspace.fs.readFile(file.uri)).toString()
    }

    const tests = parse(contents)
    addTests(file, file.uri, file.uri.path, '', tests)
  }

  async function discoverAllFilesInWorkspace () {
    if (!vscode.workspace.workspaceFolders) {
      return [] // handle the case of no open folders
    }

    return Promise.all(
      vscode.workspace.workspaceFolders.map(async workspaceFolder => {
        const pattern = new vscode.RelativePattern(workspaceFolder, config.getFilePattern())
        const watcher = vscode.workspace.createFileSystemWatcher(pattern)

        // When files are created, make sure there's a corresponding "file" node in the tree
        watcher.onDidCreate(uri => getOrCreateFile(uri))
        // When files change, re-parse them. Note that you could optimize this so
        // that you only re-parse children that have been resolved in the past.
        watcher.onDidChange(uri => parseTestsInFileContents(getOrCreateFile(uri)))
        // And, finally, delete TestItems for removed files. This is simple, since
        // we use the URI as the TestItem's ID.
        watcher.onDidDelete(uri => controller.items.delete(uri.toString()))

        for (const file of await vscode.workspace.findFiles(pattern)) {
          getOrCreateFile(file)
        }

        return watcher
      })
    )
  }

  async function runHandler (
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ) {
    const run = controller.createTestRun(request)

    const files = new Set<string>()
    const filter = new Set<string>()
    const filterOut = new Set<string>()

    async function includeTest (test: vscode.TestItem) {
      const testData = cache.getData(test)
      if (testData.type === ItemType.file && test.children.size === 0) {
        await parseTestsInFileContents(test)
      }
      if (test.children.size > 0) {
        test.children.forEach(includeTest)
      } else if (test.uri) {
        run.enqueued(test)
        files.add(test.uri.fsPath)
        if (testData.name) {
          filter.add(testData.name)
        }
      }
    }

    function excludeTest (test: vscode.TestItem) {
      if (test.uri && files.has(test.uri.fsPath)) {
        const testData = cache.getData(test)
        if (testData.type === ItemType.file) {
          files.delete(test.uri.fsPath)
        } else if (testData.name) {
          filterOut.add(testData.name)
        }
      }
    }

    if (request.include) {
      await Promise.all(request.include.map(includeTest))
    } else {
      const tests: vscode.TestItem[] = []
      controller.items.forEach(test => tests.push(test))
      await Promise.all(tests.map(includeTest))
    }

    if (request.exclude) {
      request.exclude.forEach(excludeTest)
    }

    await runner.execute(context, run, files, filter, filterOut, token)
  }

  controller.createRunProfile(
    'Run',
    vscode.TestRunProfileKind.Run,
    (request, token) => {
      runHandler(request, token)
    }
  )

  console.log('[Busted] Activated')
}

// this method is called when your extension is deactivated
export function deactivate () { }
