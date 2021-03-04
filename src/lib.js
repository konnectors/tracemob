const { log } = require('cozy-konnector-libs')
const TRIP_COLLECTION = 'analysis/cleaned_trip'
const PURPOSE_COLLECTION = 'manual/purpose_confirm'
const MODE_COLLECTION = 'manual/mode_confirm'

const {
  getServerCollectionFromDate,
  getTripsForDay
} = require('./trace-requests')
const { saveTrip, updateTripsWithManualEntries } = require('./timeseries.js')

function filterTripsByDate(trips, tripStartDates) {
  return trips.filter(trip => {
    return tripStartDates.includes(trip.properties.start_fmt_time)
  })
}

/**
 * Fetch and save trips from a trace server
 *
 * @param {string} token - The user token
 * @param {Date} startDate - The starting date
 * @param {options} - The options
 * @returns {Date} The date of the last saved trip
 */
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

  return savePromises.length > 0
    ? new Date(trips[trips.length - 1].metadata.write_fmt_time).toISOString()
    : null
}

/**
 * Fetch and save manual data from a trace server
 *
 * @param {string} token - The user token
 * @param {Date} startManualDate - The starting date
 * @param {options} - The options
 * @returns {Date} The date of the last saved manual data
 */
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
