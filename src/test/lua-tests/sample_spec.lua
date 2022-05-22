describe("describe block 1", function()
    it("should succeed", function()
        assert.is_true(true)
    end)

    it("should failed within assert", function()
        assert.is_false(true)
    end)

    it("should error", function()
        error("unit test error")
    end)

    pending("is pending", function()
        print("this test is pending")
    end)
end)

describe("error in describe", function()
    error("describe error")
    it("should not run", function()
        
    end)
end)

describe("error in setup", function()
    setup(function()
        error("before error")
    end)

    it("should not run", function()
        
    end)
end)

describe("error in teardown", function()
    teardown(function()
        assert.is_false(true)
        error("teardown error")
    end)

    it("should run", function()
        
    end)
end)

describe("error in before_each", function()
    before_each(function()
        error("before_each error")
    end)

    it("should not run 1", function()
        
    end)

    it("should not run 2", function()
        
    end)
end)


describe("error in after_each", function()
    after_each(function()
        error("after_each error")
    end)

    it("should run 1", function()
        
    end)

    it("should run 2", function()
        
    end)
end)

