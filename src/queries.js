const cozyClient = require('cozy-konnector-libs/dist/libs/cozyclient')
const { Q } = require('cozy-client')

const { VENDOR, GEOJSON_DOCTYPE } = require('./const')

const client = cozyClient.new

// TODO: use (and adapt) fetchTimeSeriesByIntervalAndSource from cozy-client models
async function findSavedTripByDates(firstDate, lastDate, { accountId, limit }) {
  const query = Q(GEOJSON_DOCTYPE)
    .where({
      source: VENDOR,
      'cozyMetadata.sourceAccount': accountId,
      startDate: {
        $gte: firstDate,
        $lte: lastDate
      }
    })
    .indexFields([
      'source',
      'cozyMetadata.sourceAccount',
      'startDate',
      'endDate'
    ])
    .sortBy([
      { source: 'desc' },
      { 'cozyMetadata.sourceAccount': 'desc' },
      { startDate: 'desc' },
      { endDate: 'desc' }
    ])
    .limitBy(limit || 100)
  const { data: trips } = await client.query(query)
  return trips
}

module.exports = {
  findSavedTripByDates
}
