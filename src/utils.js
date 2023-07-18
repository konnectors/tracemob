// @ts-check
const { chunk, differenceWith, sortBy, uniqBy } = require('lodash')
const { findSavedTripByDates } = require('./queries')
const { BASE_URLS } = require('./const')

function canSaveNextTripsChunk(startExecTime, timeout) {
  const executionTimeSeconds = (new Date() - startExecTime) / 1000
  return executionTimeSeconds < timeout
}

async function restartKonnector(client, accountId) {
  const args = {
    konnector: 'tracemob',
    account: accountId
  }

  const jobCollection = client.collection('io.cozy.jobs')
  return jobCollection.create('konnector', args)
}

function createChunks(tripsMetadata, chunkSize) {
  return chunk(tripsMetadata, chunkSize)
}

async function keepOnlyNewTrips(trips, accountId) {
  if (trips.length < 1) {
    return []
  }
  const firstDate = trips[0].properties.start_fmt_time
  const lastDate = trips[trips.length - 1].properties.start_fmt_time
  const existingTrips = await findSavedTripByDates(firstDate, lastDate, {
    accountId,
    limit: trips.length
  })
  const tripsToSave = differenceWith(trips, existingTrips, trip => {
    const duplicate = existingTrips.find(existingTrip => {
      return (
        new Date(trip.properties.start_fmt_time).getTime() ===
          new Date(existingTrip.startDate).getTime() &&
        new Date(trip.properties.end_fmt_time).getTime() ===
          new Date(existingTrip.endDate).getTime()
      )
    })
    return duplicate
  })
  return tripsToSave
}

function keepMoreRecentTripsWhenDuplicates(trips) {
  const sortedDescending = sortBy(trips, ['startDate']).reverse()
  return uniqBy(sortedDescending, '_id')
}

function getBaseURL(providerId) {
  return BASE_URLS[providerId]['URL']
}
module.exports = {
  canSaveNextTripsChunk,
  restartKonnector,
  createChunks,
  keepOnlyNewTrips,
  keepMoreRecentTripsWhenDuplicates,
  getBaseURL
}
