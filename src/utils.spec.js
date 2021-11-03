jest.mock('./queries.js')
const { findSavedTripByDates } = require('./queries')
const { keepOnlyNewTrips } = require('./utils')

describe('remove duplicates', () => {
  const trips = [
    {
      properties: {
        start_fmt_time: '2021-01-01T12:00:00',
        end_fmt_time: '2021-01-01T13:00:00'
      }
    },
    {
      properties: {
        start_fmt_time: '2021-01-02T12:00:00',
        end_fmt_time: '2021-01-02T13:00:00'
      }
    }
  ]

  it('should not include already existing trips', async () => {
    findSavedTripByDates.mockResolvedValueOnce([
      {
        startDate: '2021-01-01T12:00:00',
        endDate: '2021-01-01T13:00:00'
      },
      {
        startDate: '2021-01-02T12:00:00',
        endDate: '2021-01-02T13:00:00'
      }
    ])

    let tripsWithoutDuplicates = await keepOnlyNewTrips(trips)
    expect(tripsWithoutDuplicates).toEqual([])

    findSavedTripByDates.mockResolvedValueOnce([
      {
        startDate: '2021-01-01T12:00:00',
        endDate: '2021-01-01T13:00:00'
      }
    ])
    tripsWithoutDuplicates = await keepOnlyNewTrips(trips)
    expect(tripsWithoutDuplicates).toEqual([trips[1]])

    findSavedTripByDates.mockResolvedValueOnce([
      {
        startDate: '2021-01-02T12:00:00',
        endDate: '2021-01-02T13:00:00'
      }
    ])
    tripsWithoutDuplicates = await keepOnlyNewTrips(trips)
    expect(tripsWithoutDuplicates).toEqual([trips[0]])

    findSavedTripByDates.mockResolvedValueOnce([])
    tripsWithoutDuplicates = await keepOnlyNewTrips(trips)
    expect(tripsWithoutDuplicates).toEqual(trips)
  })
})
