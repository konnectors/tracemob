const cozyClient = require('cozy-konnector-libs/dist/libs/cozyclient')
const { log } = require('cozy-konnector-libs')
const { Q } = require('cozy-client')

const { findSavedTripByDates } = require('./queries')
const { keepOnlyNewTrips } = require('./utils')
const { VENDOR, GEOJSON_DOCTYPE, ACCOUNT_DOCTYPE } = require('./const')

const client = cozyClient.new

async function saveTrips(trips, { accountId, device }) {
  const tripsToSave = await keepOnlyNewTrips(trips, accountId)
  const timeseries = tripsToSave.map(trip => {
    const startDate = trip.properties.start_fmt_time
    const endDate = trip.properties.end_fmt_time
    return {
      _type: GEOJSON_DOCTYPE,
      series: [trip],
      startDate,
      endDate,
      source: VENDOR,
      captureDevice: device
    }
  })
  if (timeseries.length > 0) {
    await client.saveAll(timeseries)
  }
}

// TODO: use saveTimeSeries from cozy-client models
async function updateTripsWithManualEntries(
  manualEntries,
  { accountId, entryKey }
) {
  for (const entry of manualEntries) {
    const savedTrip = await findSavedTripByDates(
      entry.data.start_fmt_time,
      entry.data.end_fmt_time,
      { accountId, limit: 1 }
    )
    if (!savedTrip || savedTrip.length < 1) {
      log(
        'error',
        `No trip found for the manual entry from ${entry.data.start_fmt_time} to ${entry.data.end_fmt_time}`
      )
      continue
    }
    const newTrip = { ...savedTrip[0] }
    newTrip.series[0].properties[entryKey] = entry.data.label
    await client.save(newTrip)
  }
}

async function saveAccountData(accountId, accountData) {
  const { data: account } = await client.query(
    Q(ACCOUNT_DOCTYPE).getById(accountId)
  )
  return client.save({ ...account, data: accountData })
}

module.exports = {
  updateTripsWithManualEntries,
  saveTrips,
  saveAccountData
}
