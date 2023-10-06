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

  const currentDir = process.cwd()

  await new Promise((resolve: Function, reject: Function) => {
    const args = [
      ...[...filter].map(name => `--filter=${name}`),
      '-o', reporterPath,
      ...config.getArguments(),
      ...files
    ]
    
    let executableToSpawn
    switch (process.platform) {
      case 'win32':
        // to support files with spaces, temporarily change dir
        const parsedPath = path.parse(bustedExecutable)
        if (parsedPath.dir !== '') {
          // only chdir when it is actually a file
          process.chdir(parsedPath.dir)
          console.log('[Busted] set dir before execute:', parsedPath.dir)
        }
        executableToSpawn = parsedPath.base
        break
      default:
        executableToSpawn = bustedExecutable
        break
    }
    console.log('[Busted] execute:', executableToSpawn, args)
    const busted = spawn(executableToSpawn, args, {
      cwd: config.getWorkingDirectory(),
      env: { ...process.env, ...config.getEnvironment() }
    })

    if (process.cwd() !== currentDir) {
      console.log('[Busted] set dir back to original:', currentDir)
      process.chdir(currentDir)
    }

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
      switch (process.platform) {
        case 'win32':
          const parsedPath = path.parse(bustedExecutable)
          run.appendOutput('If you recently updated the PATH file, try restarting VSCode. ', undefined, currentTest)
          run.appendOutput('If still not detected, try a system restart.\r\n', undefined, currentTest)
          if (parsedPath.ext === '') {
            // warn about needing the extension name to properly run if its not an exe even if it is in PATH
            run.appendOutput('If your busted executable is not an exe file, ', undefined, currentTest)
            run.appendOutput('type its extension name even if it is in PATH. ', undefined, currentTest)
            run.appendOutput('Example: busted.bat\r\n', undefined, currentTest)
          }
          break
      }
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
  }).catch(error => {
      vscode.window.showErrorMessage(error.message);
      console.log(`[Run] error: ${error.message}`);
      run.appendOutput(`Error occured during run: ${error.message}\r\n`);
      run.end()
    })

  run.end()
}
