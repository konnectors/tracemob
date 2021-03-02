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

  const userToken = fields.password // TEMPORARY: the token should be retrieved from the account

  /* Get the trips starting date */
  let startDate
  let startManualDate
  let firstRun = false
  try {
    const accountData = await this.getAccountData()
    if (accountData && accountData.lastSavedTripDate) {
      startDate = new Date(accountData.lastSavedTripDate)
    }
    if (accountData && accountData.lastSavedManualDate) {
      startManualDate = new Date(accountData.lastSavedManualDate)
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
    firstRun = true
  }
  if (!startManualDate) {
    startManualDate = startDate
  }

  /* Extract the days having saved trips */
  log('info', `Fetch trips metadata from ${startDate.toISOString()}`)
  const trips = await getServerCollectionFromDate(
    userToken,
    startDate,
    TRIP_COLLECTION,
    { excludeFirst: !firstRun }
  )
  if (trips.length < 1) {
    // Continue the execution to check manual entries
    log('info', 'No new trip found.')
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
    const fullTripsForDay = await getTripsForDay(userToken, day)
    tripsToSave = tripsToSave.concat(fullTripsForDay)
  }

  /* Save the trips in database */
  const savePromises = tripsToSave.map(async trip => {
    return new Promise(resolve => resolve(saveTrip(trip)))
  })
  log('info', `Save ${savePromises.length} trips`)
  await Promise.all(savePromises)

  /* Save the last processed trip date in the account */
  if (savePromises.length > 1) {
    try {
      const lastSavedTripDate = trips[trips.length - 1].metadata.write_fmt_time
      log('info', `Save last trip date : ${lastSavedTripDate}`)
      await this.saveAccountData({ lastSavedTripDate })
    } catch (e) {
      log('error', e)
    }
  }

  /* Find manual entries */
  const manualPurposes = await getServerCollectionFromDate(
    userToken,
    startManualDate,
    PURPOSE_COLLECTION,
    { excludeFirst: !firstRun }
  )
  const manualModes = await getServerCollectionFromDate(
    userToken,
    startManualDate,
    MODE_COLLECTION,
    { excludeFirst: !firstRun }
  )

  /* Update trips accordingly to manual entries */
  let lastPurposeDate = null
  let lastModeDate = null
  if (manualPurposes.length > 0) {
    log('info', `Save ${manualPurposes.length} new manual purposes.`)
    await updateTripsWithManualEntries(manualPurposes, {
      entryKey: 'manual_purpose'
    })
    lastPurposeDate = new Date(
      manualPurposes[manualPurposes.length - 1].metadata.write_fmt_time
    )
  }
  if (manualModes.length > 0) {
    log('info', `Save ${manualModes.length} new manual modes.`)
    await updateTripsWithManualEntries(manualModes, { entryKey: 'manual_mode' })
    lastModeDate = new Date(
      manualModes[manualModes.length - 1].metadata.write_fmt_time
    )
  }

  /* Save date of last manual entry */
  if (lastPurposeDate || lastModeDate) {
    try {
      const lastSavedManualDate =
        lastPurposeDate > lastModeDate
          ? lastPurposeDate.toISOString()
          : lastModeDate.toISOString()
      log('info', `Save last manual date : ${lastSavedManualDate}`)
      await this.saveAccountData({ lastSavedManualDate })
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

async function getServerCollectionFromDate(
  token,
  startDate,
  collection,
  { excludeFirst = true } = {}
) {
  // Note the expected timestamp is in seconds
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
  return excludeFirst ? results.phone_data.slice(1) : results.phone_data
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
