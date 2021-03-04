const { log, cozyClient } = require('cozy-konnector-libs')

const DATA_TYPE = 'geojson'
const VENDOR = 'agremob.com'
const client = cozyClient.new

// TODO: use fetchTimeSeriesByIntervalAndSource from cozy-client models
async function findSavedTripByDates(startDate, endDate) {
  const doctype = `io.cozy.timeseries.${DATA_TYPE}`
  const query = client
    .find(doctype)
    .where({
      source: VENDOR,
      startDate: {
        $gte: startDate
      },
      endDate: {
        $lte: endDate
      }
    })
    .indexFields(['source', 'startDate', 'endDate'])
    .sortBy([{ source: 'desc' }, { startDate: 'desc' }, { endDate: 'desc' }])
    .limitBy(1)
  const trips = await client.query(query)
  return trips.data.length > 0 ? trips.data[0] : null
}

// TODO: use saveTimeSeries from cozy-client models
const saveTrip = async function(trip) {
  const startDate = trip.properties.start_fmt_time
  const endDate = trip.properties.end_fmt_time
  const timeserie = {
    _type: `io.cozy.timeseries.${DATA_TYPE}`,
    series: [trip],
    startDate,
    endDate,
    source: VENDOR
  }
  return client.save(timeserie)
}

// TODO: use saveTimeSeries from cozy-client models
async function updateTripsWithManualEntries(manualEntries, { entryKey }) {
  for (const entry of manualEntries) {
    const savedTrip = await findSavedTripByDates(
      entry.data.start_fmt_time,
      entry.data.end_fmt_time
    )
    if (!savedTrip) {
      log(
        'error',
        `No trip found for the manual entry from ${entry.data.start_fmt_time} to ${entry.data.end_fmt_time}`
      )
      continue
    }
    const newTrip = { ...savedTrip }
    newTrip.series[0].properties[entryKey] = entry.data.label
    await client.save(newTrip)
  }
}

module.exports = {
  saveTrip,
  updateTripsWithManualEntries
}
