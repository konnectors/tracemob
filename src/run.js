const cozyClient = require('cozy-konnector-libs/dist/libs/cozyclient')
const errors = require('cozy-konnector-libs/dist/helpers/errors')
const { log } = require('cozy-konnector-libs')

const {
  fetchAndSaveTrips,
  fetchAndSaveManualEntries,
  fetchTripsMetadata
} = require('./lib')
const { getFirstAndLastTripTimestamp } = require('./trace-requests')
const {
  canSaveNextTripsChunk,
  restartKonnector,
  createChunks
} = require('./utils')
const { saveAccountData } = require('./save')
const { TRIPS_CHUNK_SIZE } = require('./const')
const client = cozyClient.new

const getTimeout = () => {
  const maxExecutionTimeSeconds = parseInt(process.env.COZY_TIME_LIMIT, 10)
  return maxExecutionTimeSeconds - 100
}

const startExecTime = new Date()

const run = async ({ fields, accountData, accountId }) => {
  log('info', 'Start the Tracemob konnector')

  // We use the login field as an identifier that can be used as a device name.
  const device = fields.login || 'Tracemob'
  // TODO: the token might be retrieved directly in the account
  const token = fields.password

  /* Get the trips starting date */
  let startDate
  let startManualDate
  let firstRun = false
  try {
    if (accountData && accountData.lastSavedTripDate) {
      startDate = new Date(accountData.lastSavedTripDate)
    }
    if (accountData && accountData.lastSavedManualDate) {
      startManualDate = new Date(accountData.lastSavedManualDate)
    }
    if (!startDate) {
      const timestamps = await getFirstAndLastTripTimestamp(token)
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
    const tripsMetadata = await fetchTripsMetadata(token, startDate, {
      excludeFirst: !firstRun
    })

    /* Create chunks of trips to serialize execution */
    const tripChunks = createChunks(tripsMetadata, TRIPS_CHUNK_SIZE)
    log('info', `${tripChunks.length} chunks of trips to save`)

    for (const chunk of tripChunks) {
      /* Fetch new trips from the start date and save them in geojson doctype */
      const lastSavedTripDate = await fetchAndSaveTrips(token, chunk, {
        accountId,
        device
      })
      if (lastSavedTripDate) {
        log('info', `Save last trip date : ${lastSavedTripDate}`)
        await saveAccountData(accountId, { ...accountData, lastSavedTripDate })
      }
      if (!canSaveNextTripsChunk(startExecTime, getTimeout())) {
        log('info', `No time left to save the remaining trips, restart job.`)
        // Abort the execution to avoid timeout and restart the job
        await restartKonnector(client)
        return
      }
    }

    if (!canSaveNextTripsChunk(startExecTime, getTimeout())) {
      log('info', `No time left to save the manual entries, restart job.`)
      // Abort the execution to avoid timeout and restart the job
      await restartKonnector(client)
      return
    }
    /* Fetch new manual entries from the start date and update trips accordingly */
    const lastSavedManualDate = await fetchAndSaveManualEntries(
      token,
      startManualDate,
      {
        accountId,
        excludeFirst: !firstRun
      }
    )

    if (lastSavedManualDate) {
      log('info', `Save last manual date : ${lastSavedManualDate}`)
      await saveAccountData(accountId, { ...accountData, lastSavedManualDate })
    }
  } catch (err) {
    log('error', err && err.message)
    if (err.statusCode === 403) {
      throw new Error(errors.LOGIN_FAILED)
    }
    throw new Error(errors.VENDOR_DOWN)
  }
}

module.exports = run
