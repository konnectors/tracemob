const { fetchAndSaveTrips, fetchAndSaveManualEntries } = require('./lib')

const {
  getServerCollectionFromDate,
  getTripsForDay
} = require('./trace-requests.js')
const { updateTripsWithManualEntries } = require('./timeseries.js')

jest.mock('./timeseries', () => ({
  saveTrip: jest.fn(),
  updateTripsWithManualEntries: jest.fn()
}))

jest.mock('./trace-requests', () => ({
  getServerCollectionFromDate: jest.fn(),
  getTripsForDay: jest.fn()
}))

const token = 'fake-token'

describe('konnector', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should correctly fetch trips', async () => {
    const mockedTrips = [
      {
        data: {
          start_fmt_time: '2021-02-01T12:00'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:00'
        }
      },
      {
        data: {
          start_fmt_time: '2021-02-01T14:00'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:01'
        }
      },
      {
        data: {
          start_fmt_time: '2021-02-02T12:00'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:02'
        }
      }
    ]

    const fullTripsDay1 = [
      {
        properties: {
          distance: 100,
          start_fmt_time: '2021-02-01T12:00'
        }
      },
      {
        properties: {
          distance: 50,
          start_fmt_time: '2021-02-01T14:00'
        }
      }
    ]
    const fullTripsDay2 = [
      {
        properties: {
          distance: 200,
          start_fmt_time: '2021-02-02T12:00'
        }
      }
    ]

    getServerCollectionFromDate.mockResolvedValue(mockedTrips)
    getTripsForDay.mockResolvedValueOnce(fullTripsDay1)
    getTripsForDay.mockResolvedValueOnce(fullTripsDay2)

    const startDate = new Date('2021-01-01')

    const lastTripDate = await fetchAndSaveTrips(token, startDate, {
      excludeFirst: false
    })

    expect(getServerCollectionFromDate).toHaveBeenCalledWith(
      token,
      startDate,
      'analysis/cleaned_trip',
      { excludeFirst: false }
    )

    expect(getTripsForDay).toHaveBeenCalledTimes(2)
    expect(getTripsForDay).toHaveBeenNthCalledWith(1, token, '2021-02-01')
    expect(getTripsForDay).toHaveBeenNthCalledWith(2, token, '2021-02-02')

    expect(lastTripDate).toBe('2021-03-01T12:00:02')
  })

  it('should correctly fetch manual data', async () => {
    const startDate = new Date('2021-01-01')

    const manualPurposes = [
      {
        data: {
          label: 'home'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:00'
        }
      }
    ]
    const manualModes = [
      {
        data: {
          label: 'drove_alone'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:02'
        }
      },
      {
        data: {
          label: 'walk'
        },
        metadata: {
          write_fmt_time: '2021-03-01T12:00:03'
        }
      }
    ]
    getServerCollectionFromDate.mockResolvedValueOnce(manualPurposes)
    getServerCollectionFromDate.mockResolvedValueOnce(manualModes)

    const lastDate = await fetchAndSaveManualEntries(token, startDate, {
      excludeFirst: false
    })

    expect(getServerCollectionFromDate).toHaveBeenCalledWith(
      token,
      startDate,
      'manual/purpose_confirm',
      { excludeFirst: false }
    )

    expect(getServerCollectionFromDate).toHaveBeenLastCalledWith(
      token,
      startDate,
      'manual/mode_confirm',
      { excludeFirst: false }
    )

    expect(updateTripsWithManualEntries).toHaveBeenCalledTimes(2)

    expect(lastDate).toBe(new Date('2021-03-01T12:00:03').toISOString())
  })
})
