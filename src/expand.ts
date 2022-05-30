// Copied from https://github.com/microsoft/vscode-cmake-tools/blob/56db1baecc8c7b67aea2351624d55d013aa5370a/src/expand.ts , then simplified for our need.

/**
 * Module for working with and performing expansion of template strings
 * with `${var}`-style variable template expressions.
 */

import path = require('path')
import * as vscode from 'vscode'

/**
 * Escape a string so it can be used as a regular expression
 */
function escapeStringForRegex (str: string): string {
  return str.replace(/([.*+?^=!:${}()|[\]/\\])/g, '\\$1')
}

/**
 * Replace all occurrences of `needle` in `str` with `what`
 * @param str The input string
 * @param needle The search string
 * @param what The value to insert in place of `needle`
 * @returns The modified string
 */
function replaceAll (str: string, needle: string, what: string) {
  const pattern = escapeStringForRegex(needle)
  const re = new RegExp(pattern, 'g')
  return str.replace(re, what)
}

/**
 * Fix slashes in Windows paths for CMake
 * @param str The input string
 * @returns The modified string with fixed paths
 */
function fixPaths (str: string | undefined) {
  if (str === undefined) {
    return undefined
  }
  const fixPaths = /[A-Z]:(\\((?![<>:"/\\|?*]).)+)*\\?(?!\\)/gi
  let pathmatch: RegExpMatchArray | null = null
  let newstr = str
  while ((pathmatch = fixPaths.exec(str))) {
    const pathfull = pathmatch[0]
    const fixslash = pathfull.replace(/\\/g, '/')
    newstr = newstr.replace(pathfull, fixslash)
  }
  return newstr
}

function userHome (): string {
  if (process.platform === 'win32') {
    return path.join(process.env.HOMEDRIVE || 'C:', process.env.HOMEPATH || 'Users\\Public')
  } else {
    return process.env.HOME || process.env.PROFILE!
  }
}

/**
 * Replace ${variable} references in the given string with their corresponding
 * values.
 * @param instr The input string
 * @returns A string with the variable references replaced
 */
export function expandString<T> (tmpl: string | T): string | T {
  if (typeof tmpl !== 'string') {
    return tmpl
  }

  let result = tmpl

  const expansion = expandStringHelper(result)
  result = expansion.result

  // eslint-disable-next-line no-template-curly-in-string
  return replaceAll(result, '${dollar}', '$')
}

function expandStringHelper (tmpl: string) {
  const env = process.env
  let workspaceFolder: string | undefined
  if (vscode.workspace.workspaceFolders) {
    workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath
  }
  const repls: { [id: string] : string | undefined} = {
    workspaceFolder,
    workspaceFolderBasename: workspaceFolder ? path.basename(workspaceFolder) : undefined,
    userHome: userHome()
  }

  // We accumulate a list of substitutions that we need to make, preventing
  // recursively expanding or looping forever on bad replacements
  const subs = new Map<string, string>()

  const varRE = /\$\{(\w+)\}/g
  let mat: RegExpMatchArray | null = null
  while ((mat = varRE.exec(tmpl))) {
    const full = mat[0]
    const key = mat[1]
    if (key !== 'dollar') {
      // Replace dollar sign at the very end of the expanding process
      const repl = repls[key]
      if (!repl) {
        console.log('Invalid variable reference', full, 'in string:', tmpl)
      } else {
        subs.set(full, repl)
      }
    }
  }

  // Regular expression for variable value (between the variable suffix and the next ending curly bracket):
  // .+? matches any character (except line terminators) between one and unlimited times,
  // as few times as possible, expanding as needed (lazy)
  const varValueRegexp = '.+?'
  const envRE = RegExp(`\\$\\{env:(${varValueRegexp})\\}`, 'g')
  while ((mat = envRE.exec(tmpl))) {
    const full = mat[0]
    const varname = mat[1]
    const repl = fixPaths(env[varname]) || ''
    subs.set(full, repl)
  }

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const folderRE = RegExp(`\\$\\{workspaceFolder:(${varValueRegexp})\\}`, 'g')
    mat = folderRE.exec(tmpl)
    while (mat) {
      const full = mat[0]
      const folderName = mat[1]
      const f = vscode.workspace.workspaceFolders.find(folder => folder.name.toLocaleLowerCase() === folderName.toLocaleLowerCase())
      if (f) {
        subs.set(full, f.uri.fsPath)
      }
      mat = folderRE.exec(tmpl)
    }
  }

  let finalStr = tmpl
  let didReplacement = false
  subs.forEach((value, key) => {
    if (value !== key) {
      finalStr = replaceAll(finalStr, key, value)
      didReplacement = true
    }
  })
  return { result: finalStr, didReplacement }
}
