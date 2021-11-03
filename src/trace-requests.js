const requestFactory = require('cozy-konnector-libs/dist/libs/request')
const { BASE_URL } = require('./const')
const request = requestFactory({
  cheerio: false,
  json: true,
  jar: false
})

/**
 * Get first and last trip dates
 *
 * @param {string} token - The user token
 * @returns {object} - The first and last trip timestamps
 */
const getFirstAndLastTripTimestamp = async function(token) {
  const path = `${BASE_URL}/pipeline/get_range_ts`
  const body = {
    user: token
  }
  return request(path, { method: 'POST', body })
}

/**
 * Get database collection on a time range
 *
 * @param {string} token - The user token
 * @param {Date} startDate - The starting date
 * @param {string} collection - The collection name
 * @param {options} - The options
 * @returns {object} - The request results
 */
const getServerCollectionFromDate = async function(
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

/**
 * Get the full trips for a day
 *
 * @param {string} token - The user token
 * @param {string} day - The day on a YYYY-MM-DD format
 * @returns {object} - The full trips for this day
 */
const getTripsForDay = async function(token, day) {
  const path = `${BASE_URL}/timeline/getTrips/${day}`
  const body = {
    user: token
  }
  const trips = await request(path, { method: 'POST', body })
  return trips.timeline
}

module.exports = {
  getServerCollectionFromDate,
  getTripsForDay,
  getFirstAndLastTripTimestamp
}
