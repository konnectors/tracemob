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

const VENDOR = 'com.agremob'
const BASE_URL = 'https://trace.grfmap.com:8081'
// const DATA_TYPE = 'geojson'
// const timeseries = cozyClient.models.timeseries
const client = cozyClient.new

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Fetching the list of documents')

  const userToken = fields.password // TEMPORARY
  const trips = await getTripsForDay('2021-02-17', userToken)

  trips.timeline.forEach(async trip => {
    try {
      await saveTrip(trip)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
    }
  })
}

function getTripsForDay(day, token) {
  const path = `${BASE_URL}/timeline/getTrips/${day}`
  const body = {
    user: token
  }
  return request(path, { method: 'POST', body })
}

async function saveTrip(trip) {
  const startDate = trip.properties.start_fmt_time
  const endDate = trip.properties.end_fmt_time
  const timeserie = {
    _type: `io.cozy.timeseries.geojson`,
    serie: [trip],
    startDate,
    endDate,
    source: VENDOR
  }
  return client.save(timeserie)
}

/*
async function getTrips() {
  const trips = await timeseries.getTimeSerieByIntervalAndSource(client, {
    dataType: DATA_TYPE,
    startDate: '2020-02-17',
    endDate: '2020-02-17',
    source: VENDOR
  })
  console.log('trips : ', trips)
}
*/
