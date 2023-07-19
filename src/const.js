const DATA_TYPE = 'geojson'

module.exports = {
  TRIPS_CHUNK_SIZE: 100,
  VENDOR: 'agremob.com',
  GEOJSON_DOCTYPE: `io.cozy.timeseries.${DATA_TYPE}`,
  ACCOUNT_DOCTYPE: 'io.cozy.accounts',
  BASE_URL: 'https://openpath.cozycloud.cc',
  TRIP_COLLECTION: 'analysis/cleaned_trip',
  PURPOSE_COLLECTION: 'manual/purpose_confirm',
  MODE_COLLECTION: 'manual/mode_confirm'
}
