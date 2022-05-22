import * as luaparse from 'luaparse'
import { Test } from './types'

const suiteBlocks = ['describe', 'insulate', 'expose']
const testBlocks = ['it', 'pending']

function isBlockFunctionCall (node: any) {
  if (node.type === 'CallStatement' && node.expression?.type === 'CallExpression') {
    return node.expression.base.type === 'Identifier' && [...suiteBlocks, ...testBlocks].includes(node.expression.base.name)
  }
  return false
}

function getType (blockName: string) {
  if (suiteBlocks.includes(blockName)) {
    return 'Suite'
  } else if (testBlocks.includes(blockName)) {
    return 'TestCase'
  }
  throw new Error('Unexpected block name: ' + blockName)
}

function unescapeLuaString (string: string) {
  return string.replace(/\\(.)/g, '$1')
}

function parseNode (currentBlock: Test, node: any) {
  if (isBlockFunctionCall(node)) {
    const type = getType(node.expression.base.name)
    let name = ''
    if (node.expression.arguments[0]?.type === 'StringLiteral') {
      const raw = node.expression.arguments[0].raw
      name = unescapeLuaString(raw.substring(1, raw.length - 1))
    }
    const test = {
      type,
      name,
      loc: <Test['loc']>node.expression.loc,
      child: []
    }

    currentBlock.child.push(test)

    if (type === 'Suite') {
      let body
      if (node.expression.arguments[0].type === 'FunctionDeclaration') {
        body = node.expression.arguments[0].body
      } else if (node.expression.arguments[1].type === 'FunctionDeclaration') {
        body = node.expression.arguments[1].body
      }
      if (body) {
        body.forEach((node: any) => {
          parseNode(test, node)
        })
      }
    }
  }
}

export function parse (code: string): Test[] {
  const tests = {
    type: '',
    name: '',
    loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
    child: []
  }

  const ast = luaparse.parse(code.toString(), {
    comments: false,
    locations: true
  })

  if (ast.type === 'Chunk' && ast.body instanceof Array) {
    ast.body.forEach((node: any) => {
      parseNode(tests, node)
    })
  }

  return tests.child
}
