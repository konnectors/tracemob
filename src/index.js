process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://066ea9e6f9c84ef9aeb1f1592caff488@sentry.cozycloud.cc/147'

const { BaseKonnector, log } = require('cozy-konnector-libs')
const { fetchAndSaveTrips, fetchAndSaveManualEntries } = require('./lib')
const { getFirstAndLastTripTimestamp } = require('./trace-requests')

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

  const token = fields.password // TEMPORARY: the token should be retrieved from the account

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

  try {
    /* Fetch new trips from the start date and save them in geojson doctype */
    const lastSavedTripDate = await fetchAndSaveTrips(token, startDate, {
      excludeFirst: !firstRun,
      accountId: this.accountId
    })
    if (lastSavedTripDate) {
      log('info', `Save last trip date : ${lastSavedTripDate}`)
      await this.saveAccountData({ lastSavedTripDate })
    }

    /* Fetch new manual entries from the start date and update trips accordingly */
    const lastSavedManualDate = await fetchAndSaveManualEntries(
      token,
      startManualDate,
      {
        excludeFirst: !firstRun
      }
    )
    if (lastSavedManualDate) {
      log('info', `Save last manual date : ${lastSavedManualDate}`)
      await this.saveAccountData({ lastSavedManualDate })
    }
  } catch (e) {
    log('error', e)
  }
}
