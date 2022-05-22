import * as assert from 'assert'
import * as parser from '../../parser'
import * as path from 'path'
import * as fs from 'fs'

const testfile = path.resolve(__dirname, '../../../src/test/lua-tests/sample_spec.lua')
const parsedfile = path.resolve(__dirname, '../../../src/test/lua-tests/sample_spec.json')

suite('Parser', function () {
  test('returns an array of test', function () {
    const text = fs.readFileSync(testfile).toString()
    const tests = parser.parse(text)

    const expected = JSON.parse(fs.readFileSync(parsedfile).toString())
    assert.deepStrictEqual(tests, expected)
  })
})
