const { chunk } = require('lodash')
const { findSavedTripByDates } = require('./queries')
const { differenceWith } = require('lodash')

function canSaveNextTripsChunk(startExecTime, timeout) {
  const executionTimeSeconds = (new Date() - startExecTime) / 1000
  return executionTimeSeconds < timeout
}

async function restartKonnector(client) {
  const args = {
    slug: 'tracemob'
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

module.exports = {
  canSaveNextTripsChunk,
  restartKonnector,
  createChunks,
  keepOnlyNewTrips
}
