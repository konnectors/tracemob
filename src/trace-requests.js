// @ts-check
const requestFactory = require('cozy-konnector-libs/dist/libs/request')
const { getBaseURL } = require('./utils')
const request = requestFactory({
  cheerio: false,
  json: true,
  jar: false
})

/**
 * Get first and last trip dates
 *
 * @param {string} token - The user token
 * @param {string} providerId - The ID of the provider
 * @returns {Promise<object>} - The first and last trip timestamps
 */
const getFirstAndLastTripTimestamp = async function (token, providerId) {
  const BASE_URL = getBaseURL(providerId)

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
 * @param {object} options - The options
 * @param {string} providerId - The ID of the provider
 * @returns {Promise<object>} - The request results
 */
const getServerCollectionFromDate = async function (
  token,
  startDate,
  collection,
  { excludeFirst = true } = {},
  providerId
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
  const BASE_URL = getBaseURL(providerId)

  const path = `${BASE_URL}/datastreams/find_entries/timestamp`
  const results = await request(path, { method: 'POST', body })
  return excludeFirst ? results.phone_data.slice(1) : results.phone_data
}

/**
 * Get the full trips for a day
 *
 * @param {string} token - The user token
 * @param {string} day - The day on a YYYY-MM-DD format
 * @param {string} providerId - The ID of the provider
 * @returns {Promise<object>} - The full trips for this day
 */
const getTripsForDay = async function (token, day, providerId) {
  const BASE_URL = getBaseURL(providerId)

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
