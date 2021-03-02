const {
  BaseKonnector,
  requestFactory,
  log,
  cozyClient
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: false,
  json: true,
  jar: false
})

const VENDOR = 'agremob.com'
const BASE_URL = 'https://trace.grfmap.com:8081'
const DATA_TYPE = 'geojson'
const TRIP_COLLECTION = 'analysis/cleaned_trip'
const PURPOSE_COLLECTION = 'manual/purpose_confirm'
const MODE_COLLECTION = 'manual/mode_confirm'
const client = cozyClient.new
// const timeseries = client.models.timeseries

module.exports = new BaseKonnector(start)

/**
 * This konnector retrieves the user trips from a
 * [trace server](https://github.com/fabmob/tracemob-server).
 *
 * The konnector retrieves the trips starting from a date saved
 * in the account and save them in GEOJSON format, in the
 * `io.cozy.timeseries.geojson` doctype.
 * It also retrieves manual user entries and save them in
 * the associated trips.
 *
 * Note the timestamps provided by the trace server
 * are surprinsingly given in seconds.
 */

async function start(fields) {
  log('info', 'Start the Tracemob konnector')

  const userToken = fields.password // TEMPORARY: the token should be retrieved through the trigger

  /* Get the trips starting date */
  let startDate
  try {
    const accountData = await this.getAccountData()
    if (accountData && accountData.lastSavedTripDate) {
      startDate = new Date(accountData.lastSavedTripDate)
    }
  } catch (e) {
    log('error', e)
  }
  if (!startDate) {
    const timestamps = await getFirstAndLastTripTimestamp(userToken)
    if (!timestamps.start_ts || !timestamps.end_ts) {
      log('info', 'No trip saved yet. Abort.')
      return
    }
    startDate = new Date(timestamps.start_ts * 1000)
  }

  /* Extract the days having saved trips */
  log('info', `Fetch trips metadata from ${startDate.toISOString()}`)
  const trips = await getServerCollection(userToken, startDate, TRIP_COLLECTION)
  if (trips.length < 1) {
    log('info', 'No new trip found. Abort.')
    return
  }

  log('info', `${trips.length} trips to retrieve`)
  let tripDays = {}
  trips.forEach(trip => {
    const startTripDate = new Date(trip.data.start_fmt_time).toISOString()
    const day = startTripDate.split('T')[0]
    tripDays[day] = true
  })
  let tripsToSave = []

  /* Fetch the actual trips for the relevant days */
  for (const day of Object.keys(tripDays)) {
    log('info', `Fetch trips on ${day}`)
    const fullTripsForDay = await getTripsForDay(userToken, day) // what if the end is another day ?
    tripsToSave = tripsToSave.concat(fullTripsForDay)
  }

  /* Save the trips in database */
  const savePromises = tripsToSave.map(async trip => {
    return new Promise(resolve => resolve(saveTrip(trip)))
  })
  log('info', `Save ${savePromises.length} trips`)
  await Promise.all(savePromises)

  /* Find manual entries */
  const manualPurposes = await getServerCollection(
    userToken,
    startDate,
    PURPOSE_COLLECTION
  )
  const manualModes = await getServerCollection(
    userToken,
    startDate,
    MODE_COLLECTION
  )
  /* Update trips accordingly to manual entries */
  if (manualPurposes.length > 0) {
    await updateTripsWithManualEntries(manualPurposes)
  }
  if (manualModes.length > 0) {
    await updateTripsWithManualEntries(manualModes)
  }

  /* Save the last processed trip date in the account */
  if (savePromises.length > 1) {
    try {
      const lastSavedTripDate = trips[trips.length - 1].metadata.write_fmt_time
      log('info', `Save last trip end date : ${lastSavedTripDate}`)
      await this.saveAccountData({ lastSavedTripDate })
    } catch (e) {
      log('error', e)
    }
  }
}

async function getFirstAndLastTripTimestamp(token) {
  const path = `${BASE_URL}/pipeline/get_range_ts`
  const body = {
    user: token
  }
  return request(path, { method: 'POST', body })
}

async function getTripsForDay(token, day) {
  const path = `${BASE_URL}/timeline/getTrips/${day}`
  const body = {
    user: token
  }
  const trips = await request(path, { method: 'POST', body })
  return trips.timeline
}

async function getServerCollection(token, startDate, collection) {
  // Note the expected timestamp is surprisingly in seconds
  const startTime = new Date(startDate).getTime() / 1000
  const endTime = Date.now() / 1000
  const body = {
    user: token,
    start_time: startTime,
    end_time: endTime,
    key_list: [collection]
  }
  const path = `${BASE_URL}/datastreams/find_entries/timestamp`
  const results = await request(path, { method: 'POST', body })
  // The last processed trip is included in the response
  return results.phone_data.filter(trip => {
    return new Date(trip.metadata.write_fmt_time) >= startDate
  })
}

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
async function saveTrip(trip) {
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
async function updateTripsWithManualEntries(manualEntries) {
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
    newTrip.series[0].properties.manual_purpose = entry.data.label
    await client.save(newTrip)
  }
}

/* async function findSavedTripByDates(startDate, endDate) {
  console.log(`query from  ${startDate} to ${endDate}`)
  const trips = await timeseries.fetchTimeSeriesByIntervalAndSource(client, {
    dataType: DATA_TYPE,
    startDate,
    endDate,
    source: VENDOR
  })
  console.log('trips : ', trips)
  return trips.data.length > 0 ? trips.data[0] : null
}*/
