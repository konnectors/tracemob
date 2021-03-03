const { requestFactory, log, cozyClient } = require('cozy-konnector-libs')
const VENDOR = 'agremob.com'
const BASE_URL = 'https://trace.grfmap.com:8081'
const DATA_TYPE = 'geojson'
const TRIP_COLLECTION = 'analysis/cleaned_trip'
const PURPOSE_COLLECTION = 'manual/purpose_confirm'
const MODE_COLLECTION = 'manual/mode_confirm'
const request = requestFactory({
  cheerio: false,
  json: true,
  jar: false
})

const client = cozyClient.new

function filterTripsByDate(trips, tripStartDates) {
  return trips.filter(trip => {
    return tripStartDates.includes(trip.properties.start_fmt_time)
  })
}

module.exports.fetchAndSaveTrips = async function(
  token,
  startDate,
  { excludeFirst = true }
) {
  /* Extract the days having saved trips */
  log('info', `Fetch trips metadata from ${startDate.toISOString()}`)
  const trips = await getServerCollectionFromDate(
    token,
    startDate,
    TRIP_COLLECTION,
    { excludeFirst }
  )

  log('info', `${trips.length} new trips to retrieve`)
  let tripDays = {}
  const tripStartDates = []
  trips.forEach(trip => {
    const startTripDate = new Date(trip.data.start_fmt_time).toISOString()
    const day = startTripDate.split('T')[0]
    tripDays[day] = true
    tripStartDates.push(trip.data.start_fmt_time)
  })

  /* Fetch the actual trips for the relevant days */
  let tripsToSave = []
  for (const day of Object.keys(tripDays)) {
    log('info', `Fetch trips on ${day}`)
    const fullTripsForDay = await getTripsForDay(token, day)
    // The trips need to be filtered, as the day is not precise enough
    const filteredTrips = filterTripsByDate(fullTripsForDay, tripStartDates)
    tripsToSave = tripsToSave.concat(filteredTrips)
  }

  /* Save the trips in database */
  const savePromises = tripsToSave.map(async trip => {
    return new Promise(resolve => resolve(saveTrip(trip)))
  })
  log('info', `Save ${savePromises.length} trips`)
  await Promise.all(savePromises)

  return savePromises.length > 1
    ? trips[trips.length - 1].metadata.write_fmt_time
    : null
}

module.exports.fetchAndSaveManualEntries = async function(
  token,
  startManualDate,
  { excludeFirst = true }
) {
  /* Find manual entries */
  const manualPurposes = await getServerCollectionFromDate(
    token,
    startManualDate,
    PURPOSE_COLLECTION,
    { excludeFirst }
  )
  const manualModes = await getServerCollectionFromDate(
    token,
    startManualDate,
    MODE_COLLECTION,
    { excludeFirst }
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

  if (lastPurposeDate || lastModeDate) {
    return lastPurposeDate > lastModeDate
      ? lastPurposeDate.toISOString()
      : lastModeDate.toISOString()
  }
  return null
}

module.exports.getFirstAndLastTripTimestamp = async function(token) {
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
