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
const DATA_TYPE = 'geojson'
const FIRST_MIN_DATE = '2021-01-01' // Arbitrarily set a starting date for the first run
// const timeseries = cozyClient.models.timeseries
const client = cozyClient.new

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Start the Tracemob konnector')

  const userToken = fields.password // TEMPORARY: the token should be retrieved through the trigger

  let startDate = FIRST_MIN_DATE
  if (this.accountId) {
    const accountData = await this.getAccountData()
    startDate = accountData.lastSavedTripDate || FIRST_MIN_DATE
  }
  log('info', `Fetch trips metdata from ${startDate}`)
  const trips = await getTripsMetadataFromDate(userToken, startDate)
  if (trips.phone_data.length < 1) {
    // No new trip found: nothing to do
    return
  }
  log('info', `${trips.phone_data.length} trips to retrieve from ${startDate}`)

  // Extract days with trips data
  let tripDays = {}
  trips.phone_data.forEach(trip => {
    const startTripDate = new Date(trip.data.start_fmt_time).toISOString()
    const day = startTripDate.split('T')[0]
    tripDays[day] = true
  })
  let tripsToSave = []

  for (const day of Object.keys(tripDays)) {
    log('info', `Fetch trips on ${day}`)
    const fullTripsForDay = await getTripsForDay(userToken, day) // what if the end is another day ?
    tripsToSave = tripsToSave.concat(fullTripsForDay.timeline)
  }

  // Save trips in database
  const savePromises = tripsToSave.map(async trip => {
    return new Promise(resolve => resolve(saveTrip(trip)))
  })
  log('info', `Save ${savePromises.length} trips`)

  await Promise.all(savePromises)
  if (this.accountId && savePromises.length > 1) {
    const lastSavedEndTripDate =
      tripsToSave[tripsToSave.length - 1].properties.end_fmt_time

    log('info', `Save last trip end date : ${lastSavedEndTripDate}`)
    await this.saveAccountData({ lastSavedEndTripDate })
  }
}

async function getTripsForDay(token, day) {
  const path = `${BASE_URL}/timeline/getTrips/${day}`
  const body = {
    user: token
  }
  return request(path, { method: 'POST', body })
}

async function getTripsMetadataFromDate(token, startDate) {
  // Note the expected timestamp is surprisingly in seconds
  const startTime = new Date(startDate).getTime() / 1000
  const endTime = Date.now() / 1000
  const path = `${BASE_URL}/datastreams/find_entries/timestamp`
  const body = {
    user: token,
    start_time: startTime,
    end_time: endTime,
    key_list: ['analysis/cleaned_trip']
  }
  return request(path, { method: 'POST', body })
}

async function saveTrip(trip) {
  const startDate = trip.properties.start_fmt_time
  const endDate = trip.properties.end_fmt_time
  const timeserie = {
    _type: `io.cozy.timeseries.${DATA_TYPE}`,
    serie: [trip],
    startDate,
    endDate,
    source: VENDOR
  }
  return client.save(timeserie)
}

/*
async function getTrips() {
  const trips = await timeseries.fetchTimeSeriesByIntervalAndSource(client, {
    dataType: DATA_TYPE,
    startDate: '2021-02-17',
    endDate: '2021-02-18',
    source: VENDOR
  })
  console.log('trips : ', trips)
}
*/
