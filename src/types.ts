export type Test = {
  type: string,
  name: string,
  loc: {
    start: {
      line: number,
      column: number
    },
    end: {
      line: number,
      column: number
    }
  },
  child: Test[]
}

export enum ItemType {
  file,
  testSuite,
  testCase
}

export interface ItemData {
  type: ItemType;
  name?: string;
}

export type Report = {
  type: string,
  test: string,
  message?: string,
  line?: number,
  duration?: number,
  status: string
}
