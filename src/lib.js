// @ts-check
const { log } = require('cozy-konnector-libs')

const {
  getServerCollectionFromDate,
  getTripsForDay
} = require('./trace-requests')
const { saveTrips, updateTripsWithManualEntries } = require('./save.js')

const {
  TRIP_COLLECTION,
  PURPOSE_COLLECTION,
  MODE_COLLECTION
} = require('./const')

function filterTripsByDate(trips, tripStartDates) {
  return trips.filter(trip => {
    return tripStartDates.includes(trip.properties.start_fmt_time)
  })
}

/**
 * Fetch trips metadata from the given data
 * @param {string} token - The user token
 * @param {Date} startDate - The starting date
 * @param {object} options - The options
 * @returns {Promise<object[]>} The trips metadata
 */
module.exports.fetchTripsMetadata = async function (
  token,
  startDate,
  { excludeFirst = true },
  providerId
) {
  /* Get all the trips metadata from the given date */
  log('info', `Fetch trips metadata from ${startDate.toISOString()}`)
  return getServerCollectionFromDate(
    token,
    startDate,
    TRIP_COLLECTION,
    {
      excludeFirst
    },
    providerId
  )
}

/**
 * Fetch and save trips from a trace server
 *
 * @param {string} token - The user token
 * @param {object[]} tripsMetadata - The trips metadata to fetch
 * @param {object} option - The options
  * @param {string} providerId - The ID of the provider

 * @returns {Promise<Date| null>} The date of the last saved trip
 */
module.exports.fetchAndSaveTrips = async function (
  token,
  tripsMetadata,
  { accountId, device },
  providerId
) {
  /* Extract the days having saved trips */
  log('info', `${tripsMetadata.length} new trips to retrieve`)
  let tripDays = {}
  const tripStartDates = []

  for (const trip of tripsMetadata) {
    const startTripDate = new Date(trip.data.start_fmt_time).toISOString()
    const day = startTripDate.split('T')[0]
    tripDays[day] = true
    tripStartDates.push(trip.data.start_fmt_time)
  }

  /* Fetch and save the actual trips for the relevant days */
  let tripsToSave = []

  for (const day of Object.keys(tripDays)) {
    log('info', `Fetch trips on ${day}`)
    const fullTripsForDay = await getTripsForDay(token, day, providerId)
    // The trips need to be filtered, as the day is not precise enough
    const filteredTrips = filterTripsByDate(fullTripsForDay, tripStartDates)
    tripsToSave = tripsToSave.concat(filteredTrips)
  }
  if (tripsToSave.length < 1) {
    return null
  }
  log('info', `${tripsToSave.length} trips found`)
  await saveTrips(tripsToSave, { accountId, device })
  return tripsMetadata[tripsMetadata.length - 1].metadata.write_fmt_time
}

/**
 * Fetch and save manual data from a trace server
 *
 * @param {string} token - The user token
 * @param {Date} startManualDate - The starting date
 * @param {object} options - The options
 * @returns {Promise<Date | null>} The date of the last saved manual data
 */
module.exports.fetchAndSaveManualEntries = async function (
  token,
  startManualDate,
  { accountId, excludeFirst = true },
  providerId
) {
  /* Find manual entries */
  const manualPurposes = await getServerCollectionFromDate(
    token,
    startManualDate,
    PURPOSE_COLLECTION,
    { excludeFirst },
    providerId
  )
  const manualModes = await getServerCollectionFromDate(
    token,
    startManualDate,
    MODE_COLLECTION,
    { excludeFirst },
    providerId
  )

  /* Update trips accordingly to manual entries */
  let lastPurposeDate = null
  let lastModeDate = null
  if (manualPurposes.length > 0) {
    log('info', `Found ${manualPurposes.length} new manual purposes.`)
    await updateTripsWithManualEntries(manualPurposes, {
      entryKey: 'manual_purpose',
      accountId
    })
    lastPurposeDate = new Date(
      manualPurposes[manualPurposes.length - 1].metadata.write_fmt_time
    )
  }
  if (manualModes.length > 0) {
    log('info', `Found ${manualModes.length} new manual modes.`)
    await updateTripsWithManualEntries(manualModes, {
      accountId,
      entryKey: 'manual_mode'
    })
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
