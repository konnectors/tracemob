const {
  fetchAndSaveTrips,
  fetchAndSaveManualEntries,
  fetchTripsMetadata
} = require('./lib')
const { saveAccountData } = require('./save')

jest.mock('./trace-requests')
jest.mock('./lib', () => ({
  fetchTripsMetadata: jest.fn(),
  fetchAndSaveTrips: jest.fn(),
  fetchAndSaveManualEntries: jest.fn()
}))
jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  restartKonnector: jest.fn()
}))
jest.mock('./save', () => ({
  saveAccountData: jest.fn()
}))
const { restartKonnector } = require('./utils')
const { TRIPS_CHUNK_SIZE } = require('./const')

process.env.COZY_URL = 'http://test.cozy'

const run = require('./run')

describe('timeout', () => {
  const accountData = {
    lastSavedTripDate: Date.now(),
    lastSavedManualDate: Date.now()
  }
  it('should not restart execution when timeout is not reached', async () => {
    process.env.COZY_TIME_LIMIT = 3600 // in seconds
    await run({ fields: {}, accountData, accountId: 'accountId' })
    expect(restartKonnector).toHaveBeenCalledTimes(0)
  })

  it('should restart execution when timeout is detected', async () => {
    process.env.COZY_TIME_LIMIT = 1
    await run({ fields: {}, accountData, accountId: 'accountId' })
    expect(restartKonnector).toHaveBeenCalledTimes(1)
  })
})

describe('save data', () => {
  const accountData = {
    lastSavedTripDate: Date.now(),
    lastSavedManualDate: Date.now()
  }

  beforeEach(() => {
    process.env.COZY_TIME_LIMIT = 3600 // in seconds
  })

  it('should save data in chunks', async () => {
    const tripsMetadata = new Array(TRIPS_CHUNK_SIZE * 2).fill({})
    fetchTripsMetadata.mockResolvedValue(tripsMetadata)
    await run({ fields: {}, accountData, accountId: 'accountId' })
    expect(fetchAndSaveTrips).toHaveBeenCalledTimes(2)
  })

  it('should save the last saved trip date', async () => {
    fetchTripsMetadata.mockResolvedValue([{}])
    fetchAndSaveTrips.mockResolvedValue(new Date('2021-01-01'))
    await run({ fields: {}, accountData, accountId: 'accountId' })
    expect(saveAccountData).toHaveBeenCalledWith('accountId', {
      ...accountData,
      lastSavedTripDate: new Date('2021-01-01')
    })
  })

  it('should save the last manual trip date', async () => {
    fetchAndSaveManualEntries.mockResolvedValue(new Date('2021-01-01'))
    await run({ fields: {}, accountData, accountId: 'accountId' })
    expect(saveAccountData).toHaveBeenCalledWith('accountId', {
      ...accountData,
      lastSavedManualDate: new Date('2021-01-01')
    })
  })
})
