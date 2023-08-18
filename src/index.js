process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://06e0e3b9385d494dbbcdc30308a55006@errors.cozycloud.cc/64'

const BaseKonnector = require('cozy-konnector-libs/dist/libs/BaseKonnector')
const run = require('./run')

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
  const accountData = await this.getAccountData()
  await run({
    accountData,
    fields,
    accountId: this.accountId
  })
}

module.exports = new BaseKonnector(start)
