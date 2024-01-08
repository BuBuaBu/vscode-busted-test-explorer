import * as vscode from 'vscode'
import { spawn } from 'child_process'
import * as readline from 'readline'
import * as config from './config'
import * as cache from './cache'
import * as path from 'path'
import { Report } from './types'

const MAGIC = '[VSCODE-BUSTED-REPORT]'

function getErrorMessage (test: vscode.TestItem, report: Report) {
  if (report.message) {
    const diff = report.message.match(/[^:]*: (?<msg>.*)\nPassed in:\n(?<actual>.*)\nExpected:\n(?<expected>.*)/)
    let message
    if (diff && diff.groups) {
      message = vscode.TestMessage.diff(diff.groups.msg, diff.groups.expected, diff.groups.actual)
    } else {
      message = new vscode.TestMessage(report.message)
    }

    if (test.uri && report.line) {
      message.location = new vscode.Location(test.uri, new vscode.Position(report.line - 1, 0))
    }
    return message
  }
  return new vscode.TestMessage('Unknown error')
}

export async function execute (
  context: vscode.ExtensionContext,
  run: vscode.TestRun,
  files: Set<string>,
  filter: Set<string>,
  filterOut: Set<string>,
  token: vscode.CancellationToken
) {
  const bustedExecutable = config.getExecutable()

  const reporterPath = path.join(context.extensionPath, 'res', 'reporter.lua')

  await new Promise((resolve: Function, reject: Function) => {
    const args = [
      ...[...filter].map(name => `--filter=${name.replace(/ /gi, "%s")}$`),
      '-o', reporterPath,
      ...config.getArguments(),
      ...files
    ]
    console.log('[Busted] execute:', bustedExecutable, args)
    const busted = spawn(bustedExecutable, args, {
      cwd: config.getWorkingDirectory(),
      env: { ...process.env, ...config.getEnvironment() }
    })

    const rl = readline.createInterface({ input: busted.stdout })

    let currentTest: vscode.TestItem | undefined
    rl.on('line', (line: string) => {
      if (line.startsWith(MAGIC)) {
        const report = JSON.parse(line.substring(MAGIC.length + 1))
        const test = cache.getTest(report.test)
        switch (report.type) {
          case 'testStart':
            run.appendOutput(`Run test: ${report.test}\r\n`)
            if (test) {
              run.started(test)
              currentTest = test
            }
            break
          case 'testEnd':
            run.appendOutput(`End test: ${report.test} (${report.status})\r\n`)
            currentTest = undefined
            if (test) {
              switch (report.status) {
                case 'success':
                  run.passed(test, report.duration)
                  break
                case 'failure':
                  run.failed(test, getErrorMessage(test, report), report.duration)
                  break
                case 'pending':
                  run.skipped(test)
                  break
                case 'error':
                  run.errored(test, getErrorMessage(test, report), report.duration)
                  break
              }
            }
            break
          case 'error':
            run.appendOutput(report.message.replace(/([^\r])\n/g, '$1\r\n') + '\r\n', undefined, currentTest)
            break
          default:
            console.log('[Busted] unknown report type:', report.type)
            break
        }
      } else {
        run.appendOutput(line + '\r\n', undefined, currentTest)
      }
    })

    busted.stderr.on('data', data => {
      run.appendOutput(data.toString() + '\r\n', undefined, currentTest)
      console.log(`[Busted] stderr: ${data}`)
    })
    busted.on('error', (error) => {
      console.log(`[Busted] error: ${error.message}`)
      run.appendOutput(`Busted error: ${error.message}\r\n`, undefined, currentTest)
      vscode.window.showErrorMessage(`Failed to spawn busted: (${error.message})\r\nCheck that '${bustedExecutable}' is installed and in your PATH`)
    })
    busted.on('close', (code, signal) => {
      console.log(`[Busted] close: ${code}`)
      run.appendOutput(`Busted exited with code ${code}\r\n`, undefined, currentTest)
      resolve()
    })

    token.onCancellationRequested(() => {
      busted.kill()
    })
  })

  run.end()
}
