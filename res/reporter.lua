local json = require ("dkjson")

local MAGIC = '[VSCODE-BUSTED-REPORT]'

return function(options)
  local busted = require("busted")
  local handler = require("busted.outputHandlers.base")()

  local currentFile = nil
  local lastFaillure = nil

  local function report(entry)
    print(MAGIC, json.encode(entry))
  end

  local function get_test_id(element)
    if element.trace then
      return element.trace.source:sub(2) .. ":" .. handler.getFullName(element)
    end
  end

  handler.testStart = function(element, parent)
    report({
      type = "testStart",
      test = get_test_id(element),
    })
  end

  handler.testEnd = function(element, parent, status, trace)
    local test = get_test_id(element)
    local entry = {
      type = "testEnd",
      test = test,
      duration = element.duration*1000,
      status = status
    }

    if (status == "failure" or status == "error") and lastFaillure and lastFaillure.test == test then
      entry.message = lastFaillure.message
      entry.line = lastFaillure.line
    end

    report(entry)
  end

  handler.failureTest = function(element, parent, message, trace)
    lastFaillure = {
      test = get_test_id(element),
      message = message,
      line = trace.currentline
    }
  end

  handler.error = function(element, parent, message, trace)
    if element.descriptor ~= "describe" then
      element = parent
    end
    report({
      type = "error",
      test = get_test_id(element) or element.name,
      message = type(trace.message) == "table" and trace.message.message or trace.message,
      line = trace.currentline
    })
  end

  handler.fileStart = function(file)
    currentFile = file
  end

  handler.fileEnd = function(file)
    currentFile = nil
  end

  busted.subscribe({'test', 'start'}, handler.testStart)
  busted.subscribe({'test', 'end'}, handler.testEnd)

  busted.subscribe({ 'error', 'it' }, handler.failureTest)
  busted.subscribe({ 'failure', 'it' }, handler.failureTest)
  busted.subscribe({ 'error' }, handler.error)
  busted.subscribe({ 'failure' }, handler.error)

  busted.subscribe({ 'file', 'start' }, handler.fileStart)
  busted.subscribe({ 'file', 'end' }, handler.fileEnd)

  return handler
end
